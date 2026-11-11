"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarker, FaceLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";
import { drawGlasses, TURNED_AWAY_ALPHA } from "@/lib/vto/draw";
import { createFaceLandmarker } from "@/lib/vto/mediapipe";
import { computeGlassesPose, yawFromMatrix } from "@/lib/vto/pose";

export type StaticFaceOverlayStatus =
  | "idle"
  | "loading-model"
  | "detecting"
  | "ready"
  | "no-face"
  | "multiple-faces"
  | "error";

interface UseStaticFaceOverlayOptions {
  photoUrl: string | null;
  overlayImageUrl: string | null;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
}

interface UseStaticFaceOverlayResult {
  status: StaticFaceOverlayStatus;
  errorMessage: string | null;
}

// Static-photo counterpart to useFaceTracking.ts: instead of a per-video-frame detection loop,
// this detects landmarks ONCE per `photoUrl` (MediaPipe IMAGE running mode, single `.detect()`
// call) and caches them, so switching `overlayImageUrl` (trying a different frame on the same
// photo) only redraws the canvas from the cached landmarks — no re-detect (NFR2/AC3).
export function useStaticFaceOverlay({
  photoUrl,
  overlayImageUrl,
  canvasRef,
}: UseStaticFaceOverlayOptions): UseStaticFaceOverlayResult {
  const [status, setStatus] = useState<StaticFaceOverlayStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const photoImageRef = useRef<HTMLImageElement | null>(null);
  const overlayImageElRef = useRef<HTMLImageElement | null>(null);
  const landmarksRef = useRef<NormalizedLandmark[] | null>(null);
  // Matrix yaw of the detected face (radians), cached next to the landmarks; undefined → the
  // 2D estimate in computeGlassesPose is used.
  const yawRef = useRef<number | undefined>(undefined);

  // Redraws the canvas from whatever landmarks/overlay image are currently cached — called
  // both right after a fresh detection and on every overlayImageUrl change.
  function draw() {
    const canvas = canvasRef.current;
    const photo = photoImageRef.current;
    const landmarks = landmarksRef.current;
    if (!canvas || !photo || !landmarks) return;

    canvas.width = photo.naturalWidth;
    canvas.height = photo.naturalHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(photo, 0, 0, canvas.width, canvas.height);

    const overlayImage = overlayImageElRef.current;
    if (overlayImage?.complete && overlayImage.naturalWidth > 0) {
      // Same placement as the live camera (lib/vto/pose.ts) with the default width factor —
      // RecommendedProduct has no frameWidthMm. Single frame, so no smoothing and no hold.
      const pose = computeGlassesPose(landmarks, canvas.width, canvas.height, {
        yaw: yawRef.current,
      });
      drawGlasses(ctx, overlayImage, pose, pose.visible ? 1 : TURNED_AWAY_ALPHA);
    }
  }

  // Detect once per photoUrl: load the photo (crossOrigin="anonymous", same pattern
  // useFaceTracking.ts uses for the overlay image), run a single IMAGE-mode `.detect()`,
  // cache the landmarks, then draw.
  useEffect(() => {
    landmarksRef.current = null;
    yawRef.current = undefined;
    photoImageRef.current = null;

    if (!photoUrl) {
      // Deferred to a microtask so this effect never calls setState synchronously in its own
      // body (react-hooks/set-state-in-effect) — same pattern useFaceTracking.ts uses for its
      // "unsupported" early return; it still runs before the next paint.
      queueMicrotask(() => {
        setStatus("idle");
        setErrorMessage(null);
      });
      return;
    }

    let cancelled = false;
    let faceLandmarker: FaceLandmarker | null = null;

    // Same INFO:-log suppression useFaceTracking.ts applies for the life of a detection session.
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
      originalConsoleError(...args);
    };

    async function run() {
      setStatus("loading-model");
      setErrorMessage(null);

      const img = new Image();
      img.crossOrigin = "anonymous";
      const loaded = await new Promise<boolean>((resolve) => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = photoUrl as string;
      });

      if (cancelled) return;
      if (!loaded) {
        setStatus("error");
        setErrorMessage("Không thể tải ảnh để thử kính. Vui lòng thử lại.");
        return;
      }
      photoImageRef.current = img;

      let landmarker: FaceLandmarker;
      try {
        ({ landmarker } = await createFaceLandmarker("IMAGE"));
        faceLandmarker = landmarker;
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Không thể tải mô hình nhận diện khuôn mặt. Vui lòng thử lại.");
        }
        return;
      }

      if (cancelled) {
        landmarker.close();
        return;
      }

      setStatus("detecting");
      let result: FaceLandmarkerResult;
      try {
        result = landmarker.detect(img);
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Không thể nhận diện khuôn mặt trong ảnh này. Vui lòng thử lại.");
        }
        return;
      }

      if (cancelled) return;

      const faceCount = result.faceLandmarks.length;
      if (faceCount === 0) {
        setStatus("no-face");
        setErrorMessage("Không phát hiện khuôn mặt nào trong ảnh này.");
        return;
      }
      if (faceCount > 1) {
        setStatus("multiple-faces");
        setErrorMessage("Phát hiện nhiều hơn 1 khuôn mặt trong ảnh này.");
        return;
      }

      landmarksRef.current = result.faceLandmarks[0];
      const matrix = result.facialTransformationMatrixes?.[0];
      yawRef.current = matrix ? yawFromMatrix(matrix.data) : undefined;
      setStatus("ready");
      draw();
    }

    void run();

    return () => {
      cancelled = true;
      if (faceLandmarker) faceLandmarker.close();
      console.error = originalConsoleError;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draw/canvasRef are stable across renders; only photoUrl should re-trigger detection.
  }, [photoUrl]);

  // Redraw-only on overlayImageUrl change (NFR2/AC3) — no re-detection.
  useEffect(() => {
    if (!overlayImageUrl) {
      overlayImageElRef.current = null;
      if (status === "ready") draw();
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (status === "ready") draw();
    };
    img.src = overlayImageUrl;
    overlayImageElRef.current = img;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- draw is stable across renders.
  }, [overlayImageUrl, status]);

  return { status, errorMessage };
}
