"use client";

import { useEffect, useRef, useState } from "react";
import { useCameraCapture } from "@/hooks/useCameraCapture";

interface FaceCameraCaptureProps {
  onConfirm: (file: File) => void;
  onCancel: () => void;
}

// Vietnamese hints for the non-"streaming"/"captured" statuses, mirroring TryOnPage.tsx's
// STATUS_HINTS wording style (AC2, AC6).
const STATUS_HINTS: Partial<Record<string, string>> = {
  idle: "Đang khởi động camera...",
  "requesting-camera": "Đang yêu cầu quyền truy cập camera...",
};

// Renders the "Chụp ảnh" flow: live mirrored camera feed -> "Chụp" -> captured-still review ->
// "Dùng ảnh này" / "Chụp lại". All getUserMedia/canvas logic lives in useCameraCapture
// (coder.md §4) — this component only reacts to its status and renders the matching UI.
export function FaceCameraCapture({ onConfirm, onCancel }: FaceCameraCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const { status, errorMessage, start, stop, capture, retake } = useCameraCapture(videoRef);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const capturedFileRef = useRef<File | null>(null);

  // Open the camera as soon as this component mounts (i.e. as soon as "Chụp ảnh" is chosen).
  useEffect(() => {
    void start();
    // Intentionally run once on mount only — start()/stop() identity is not relevant here, the
    // page owns calling stop() on cancel/confirm/unmount (T3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Revoke the captured-still object URL once it's replaced by a new one or the component
  // unmounts — otherwise each capture leaks a blob URL.
  useEffect(() => {
    return () => {
      if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    };
  }, [capturedUrl]);

  async function handleCapture() {
    setCaptureError(null);
    try {
      const file = await capture();
      capturedFileRef.current = file;
      setCapturedUrl(URL.createObjectURL(file));
    } catch {
      setCaptureError("Không thể chụp ảnh từ camera. Vui lòng thử lại.");
    }
  }

  function handleRetake() {
    if (capturedUrl) URL.revokeObjectURL(capturedUrl);
    setCapturedUrl(null);
    capturedFileRef.current = null;
    setCaptureError(null);
    // No new start()/permission prompt — the stream never stopped (AC4).
    retake();
  }

  function handleCancel() {
    stop();
    onCancel();
  }

  function handleConfirm() {
    if (!capturedFileRef.current) return;
    // Confirm-success is one of the three exit paths that must stop the stream (cancel,
    // confirm-success, unmount — NFR2); the hook is owned here, so this component is the one
    // that stops it before handing the file up to the page.
    stop();
    onConfirm(capturedFileRef.current);
  }

  const isReviewing = status === "captured" && capturedUrl !== null;
  const hint = captureError ?? (status !== "streaming" && !isReviewing ? (STATUS_HINTS[status] ?? errorMessage) : null);

  return (
    <div className="face-analysis__camera-frame">
      <video
        ref={videoRef}
        className="face-analysis__camera-video"
        style={isReviewing ? { display: "none" } : undefined}
        playsInline
        muted
        aria-hidden="true"
      />
      {isReviewing && (
        // eslint-disable-next-line @next/next/no-img-element -- local blob object URL from the just-captured File, not a remote/optimizable image
        <img src={capturedUrl} alt="Ảnh vừa chụp" className="face-analysis__camera-still" />
      )}
      <div className="face-analysis__camera-actions">
        {isReviewing ? (
          <>
            <button type="button" className="btn btn--outline btn--small" onClick={handleRetake}>
              Chụp lại
            </button>
            <button type="button" className="btn btn--primary btn--small" onClick={handleConfirm}>
              Dùng ảnh này
            </button>
          </>
        ) : (
          <>
            <button type="button" className="btn btn--outline btn--small" onClick={handleCancel}>
              Hủy
            </button>
            {status === "streaming" && (
              <button type="button" className="btn btn--primary btn--small" onClick={handleCapture}>
                Chụp
              </button>
            )}
          </>
        )}
      </div>
      {hint && (
        <p
          role="status"
          className={`face-analysis__camera-hint${
            status === "camera-denied" || status === "unsupported" || status === "error" || captureError
              ? " face-analysis__camera-hint--error"
              : ""
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}
