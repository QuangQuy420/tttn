"use client";

import { useEffect, useRef, useState } from "react";
import type { FaceLandmarkerResult, NormalizedLandmark } from "@mediapipe/tasks-vision";

// Google's CDN copies of the MediaPipe WASM runtime + Face Landmarker model (plan Q3 default —
// simplest for a dev machine with internet access; self-hosting under public/models/ is an easy
// later swap if offline use is ever needed).
const WASM_BASE_URL =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
const MODEL_ASSET_PATH =
  "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

// Outer eye corner landmark indices in MediaPipe's 468/478-point face mesh topology — same
// numbering scheme face-processing-service already documents server-side
// (face_shape_service.py). Used to derive where/how large/how tilted to draw the glasses image.
const LEFT_EYE_OUTER_CORNER = 33;
const RIGHT_EYE_OUTER_CORNER = 263;

// numFaces raised to 2 (not 1) purely so 2+ faces can be *distinguished* from exactly 1 for the
// "only one face at a time" hint — same reasoning face_shape_service.py already uses server-side.
const MAX_FACES_TO_DETECT = 2;

export type FaceTrackingStatus =
  | "idle"
  | "requesting-camera"
  | "loading-model"
  | "tracking"
  | "camera-denied"
  | "no-face"
  | "multiple-faces"
  | "unsupported"
  | "error";

interface UseFaceTrackingOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayImageUrl: string | null;
  enabled: boolean;
}

interface UseFaceTrackingResult {
  status: FaceTrackingStatus;
  errorMessage: string | null;
}

// Position/scale/rotation for the overlay image, derived from the two outer-eye-corner
// landmarks — position = their midpoint, scale = distance between them, rotation = angle of the
// line between them (see plan's "library research" section for the exact formula).
function computeOverlayTransform(
  landmarks: NormalizedLandmark[],
  videoWidth: number,
  videoHeight: number,
) {
  const left = landmarks[LEFT_EYE_OUTER_CORNER];
  const right = landmarks[RIGHT_EYE_OUTER_CORNER];

  const leftX = left.x * videoWidth;
  const leftY = left.y * videoHeight;
  const rightX = right.x * videoWidth;
  const rightY = right.y * videoHeight;

  const centerX = (leftX + rightX) / 2;
  const centerY = (leftY + rightY) / 2;
  const eyeDistance = Math.hypot(rightX - leftX, rightY - leftY);
  const angle = Math.atan2(rightY - leftY, rightX - leftX);

  return { centerX, centerY, eyeDistance, angle };
}

// Isolates all MediaPipe + <canvas> rendering logic in one place (coder.md §4: "keep the
// MediaPipe/Canvas rendering logic isolated in its own hook/module — don't tangle real-time
// frame-processing code into general UI components"). TryOnPage/the route only reads `status`.
export function useFaceTracking({
  videoRef,
  canvasRef,
  overlayImageUrl,
  enabled,
}: UseFaceTrackingOptions): UseFaceTrackingResult {
  const [status, setStatus] = useState<FaceTrackingStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);

  // Load the overlay image once per URL change, off the main detection loop.
  useEffect(() => {
    if (!overlayImageUrl) {
      overlayImageRef.current = null;
      return;
    }
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = overlayImageUrl;
    overlayImageRef.current = img;
  }, [overlayImageUrl]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      // Deferred to a microtask so this effect never calls setState synchronously in its own
      // body (react-hooks/set-state-in-effect) — it still runs before the next paint.
      queueMicrotask(() => {
        setStatus("unsupported");
        setErrorMessage("Trình duyệt này không hỗ trợ truy cập camera.");
      });
      return;
    }

    let cancelled = false;
    let stream: MediaStream | null = null;
    let rafId: number | null = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- FaceLandmarker type imported lazily below
    let faceLandmarker: any = null;

    // MediaPipe's WASM runtime routes some of its own harmless init-time logs (e.g. "INFO:
    // Created TensorFlow Lite XNNPACK delegate for CPU.") through console.error rather than
    // console.info, which Next.js's dev overlay then surfaces as a blocking "Console Error"
    // card. Drop only that "INFO:"-prefixed noise for the life of this tracking session;
    // every other console.error call still goes through untouched.
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => {
      if (typeof args[0] === "string" && args[0].startsWith("INFO:")) return;
      originalConsoleError(...args);
    };

    async function start() {
      setStatus("requesting-camera");
      setErrorMessage(null);

      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
      } catch {
        if (!cancelled) {
          setStatus("camera-denied");
          setErrorMessage(
            "Không thể truy cập camera. Vui lòng cho phép quyền camera để thử kính AR.",
          );
        }
        return;
      }

      if (cancelled) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      await video.play();

      if (cancelled) return;

      setStatus("loading-model");
      try {
        const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
        const wasmFileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);
        faceLandmarker = await FaceLandmarker.createFromOptions(wasmFileset, {
          baseOptions: { modelAssetPath: MODEL_ASSET_PATH },
          runningMode: "VIDEO",
          numFaces: MAX_FACES_TO_DETECT,
        });
      } catch {
        if (!cancelled) {
          setStatus("error");
          setErrorMessage("Không thể tải mô hình nhận diện khuôn mặt. Vui lòng thử lại.");
        }
        return;
      }

      if (cancelled) {
        faceLandmarker.close();
        return;
      }

      const canvas = canvasRef.current;
      if (!canvas || !video) return;

      function renderFrame() {
        if (cancelled || !faceLandmarker || !video || !canvas) return;

        if (video.videoWidth === 0 || video.videoHeight === 0) {
          rafId = requestAnimationFrame(renderFrame);
          return;
        }

        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let result: FaceLandmarkerResult;
        try {
          result = faceLandmarker.detectForVideo(video, performance.now());
        } catch {
          rafId = requestAnimationFrame(renderFrame);
          return;
        }

        const faceCount = result.faceLandmarks.length;
        if (faceCount === 0) {
          setStatus("no-face");
        } else if (faceCount > 1) {
          setStatus("multiple-faces");
        } else {
          setStatus("tracking");

          const overlayImage = overlayImageRef.current;
          if (overlayImage?.complete && overlayImage.naturalWidth > 0) {
            const { centerX, centerY, eyeDistance, angle } = computeOverlayTransform(
              result.faceLandmarks[0],
              canvas.width,
              canvas.height,
            );

            // Reference width factor picked so the drawn image roughly spans the eye-to-eye
            // width plus temple margin on each side, a common heuristic for 2D glasses overlays.
            // Real glasses' front width (lens + bridge) runs ~1.3-1.4x the outer-eye-corner
            // distance — 2.2 was tried first and drew the frame comically oversized.
            const drawWidth = eyeDistance * 1.4;
            const drawHeight = drawWidth * (overlayImage.naturalHeight / overlayImage.naturalWidth);

            ctx.save();
            ctx.translate(centerX, centerY);
            ctx.rotate(angle);
            ctx.drawImage(overlayImage, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
            ctx.restore();
          }
        }

        rafId = requestAnimationFrame(renderFrame);
      }

      rafId = requestAnimationFrame(renderFrame);
    }

    void start();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (faceLandmarker) faceLandmarker.close();
      console.error = originalConsoleError;
    };
  }, [enabled, videoRef, canvasRef]);

  return { status, errorMessage };
}
