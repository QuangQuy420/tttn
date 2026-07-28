"use client";

import { useEffect, useRef, useState } from "react";

export type CameraCaptureStatus =
  | "idle"
  | "requesting-camera"
  | "streaming"
  | "captured"
  | "camera-denied"
  | "unsupported"
  | "error";

interface UseCameraCaptureResult {
  status: CameraCaptureStatus;
  errorMessage: string | null;
  start: () => Promise<void>;
  stop: () => void;
  capture: () => Promise<File>;
  retake: () => void;
}

// Isolates all getUserMedia + <canvas> capture logic in one place (coder.md §4: keep
// camera/canvas logic out of UI components). Modeled on useFaceTracking.ts's lifecycle/cleanup,
// but simpler: no MediaPipe/model loading, no per-frame detection loop — just camera-open and a
// single-frame grab on demand (plan T1).
export function useCameraCapture(
  videoRef: React.RefObject<HTMLVideoElement | null>,
): UseCameraCaptureResult {
  const [status, setStatus] = useState<CameraCaptureStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  // Bumped by every start()/stop() call. A start() only applies its result if its own token is
  // still current when its async work resolves — otherwise a superseded call (e.g. React Strict
  // Mode's dev-only double-invoke of the mount effect in FaceCameraCapture.tsx, or stop() running
  // while a start() is still in flight) would overwrite streamRef with a second, untracked stream
  // that never gets stopped. Mirrors the `cancelled`-flag pattern useFaceTracking.ts uses for the
  // same race, adapted for start/stop being called imperatively rather than from one effect.
  const startTokenRef = useRef(0);

  async function start() {
    const token = ++startTokenRef.current;

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setStatus("unsupported");
      setErrorMessage("Trình duyệt này không hỗ trợ truy cập camera.");
      return;
    }

    setStatus("requesting-camera");
    setErrorMessage(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: true });
    } catch {
      if (token === startTokenRef.current) {
        setStatus("camera-denied");
        setErrorMessage("Không thể truy cập camera. Vui lòng cho phép quyền camera để chụp ảnh.");
      }
      return;
    }

    if (token !== startTokenRef.current) {
      // Superseded while getUserMedia was pending — don't resurrect a stream nobody wants.
      stream.getTracks().forEach((track) => track.stop());
      return;
    }

    streamRef.current = stream;
    const video = videoRef.current;
    if (!video) {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setStatus("error");
      setErrorMessage("Không thể khởi động camera. Vui lòng thử lại.");
      return;
    }

    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      if (token === startTokenRef.current) {
        setStatus("error");
        setErrorMessage("Không thể khởi động camera. Vui lòng thử lại.");
      }
      return;
    }

    if (token !== startTokenRef.current) {
      // Superseded while video.play() was pending — undo what we just attached.
      stream.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      video.srcObject = null;
      return;
    }

    setStatus("streaming");
  }

  // The only thing that ends the stream — called by the page on cancel, on confirm-success, and
  // on unmount, never automatically inside capture() (T1/NFR2). Safe to call more than once.
  // Also invalidates any in-flight start() so it can't resurrect a stream after this runs.
  function stop() {
    startTokenRef.current++;
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    setStatus("idle");
    setErrorMessage(null);
  }

  // Draws the current <video> frame onto an internal canvas, center-cropped to 3:4 (AC11) and
  // mirrored via a horizontal flip on the draw (per the confirmed follow-up decision — the saved
  // photo must match the mirrored live preview pixel-for-pixel, not just visually via CSS).
  // Transitions to "captured" but does NOT stop the stream, so "Chụp lại" needs no new
  // permission prompt (AC4).
  async function capture(): Promise<File> {
    const video = videoRef.current;
    if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
      throw new Error("Camera chưa sẵn sàng để chụp ảnh.");
    }

    const videoWidth = video.videoWidth;
    const videoHeight = video.videoHeight;

    // Center-crop the video's native frame down to a 3:4 (width:height) box before drawing —
    // a plain full-frame drawImage would distort or letterbox instead of cropping (per the
    // plan's Risks & dependencies note).
    const targetRatio = 3 / 4;
    let cropWidth = videoWidth;
    let cropHeight = videoHeight;
    if (videoWidth / videoHeight > targetRatio) {
      cropWidth = videoHeight * targetRatio;
    } else {
      cropHeight = videoWidth / targetRatio;
    }
    const cropX = (videoWidth - cropWidth) / 2;
    const cropY = (videoHeight - cropHeight) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Không thể chụp ảnh từ camera.");

    // Mirror the draw (negative scale) so the captured still matches what the user saw in the
    // mirrored live preview — a CSS-only mirror on <video> does not affect what drawImage/toBlob
    // capture from that same video element.
    ctx.translate(cropWidth, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, "image/jpeg", 0.92);
    });
    if (!blob) throw new Error("Không thể chụp ảnh từ camera.");

    setStatus("captured");
    return new File([blob], "camera-capture.jpg", { type: "image/jpeg" });
  }

  // "Chụp lại": discards the captured still and goes back to the live feed. The stream was never
  // stopped by capture(), so this is just a status change — no new start()/permission prompt
  // (AC4).
  function retake() {
    setStatus("streaming");
  }

  // Safety net: stop the stream if the component unmounts while the camera is still running,
  // even if the page forgot to call stop() on every exit path (NFR2).
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, []);

  return { status, errorMessage, start, stop, capture, retake };
}
