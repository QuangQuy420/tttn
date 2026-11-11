"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker, FaceLandmarkerResult } from "@mediapipe/tasks-vision";
import { drawGlasses, TURNED_AWAY_ALPHA } from "@/lib/vto/draw";
import { createFaceLandmarker } from "@/lib/vto/mediapipe";
import type { MediaPipeDelegate } from "@/lib/vto/mediapipe";
import { FpsMeter, RollingStats, toCsv, toJson } from "@/lib/vto/metrics";
import type { BenchmarkFrame } from "@/lib/vto/metrics";
import { DEFAULT_EMA_ALPHA, DEFAULT_FILTER_PARAMS, PoseSmoother } from "@/lib/vto/oneEuro";
import type { OneEuroParams, SmoothingMode } from "@/lib/vto/oneEuro";
import { computeGlassesPose, DEFAULT_WIDTH_FACTOR, yawFromMatrix } from "@/lib/vto/pose";
import type { GlassesPose } from "@/lib/vto/pose";
import { LostFaceTracker } from "@/lib/vto/tracking";

export type FaceTrackingStatus =
  | "idle"
  | "requesting-camera"
  | "loading-model"
  | "tracking"
  | "turned-away"
  | "camera-denied"
  | "no-face"
  | "multiple-faces"
  | "unsupported"
  | "error";

export interface FaceTrackingStats {
  fps: number;
  latencyP50: number;
  latencyP95: number;
  delegate: MediaPipeDelegate | null;
  yawDeg: number;
}

interface UseFaceTrackingOptions {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  overlayImageUrl: string | null;
  enabled: boolean;
  smoothing?: SmoothingMode;
  // Must be referentially stable (state or a module constant) — a new object rebuilds the smoother.
  filterParams?: OneEuroParams;
  widthFactor?: number;
  debug?: boolean;
}

interface UseFaceTrackingResult {
  status: FaceTrackingStatus;
  errorMessage: string | null;
  stats: FaceTrackingStats | null;
  isBenchmarking: boolean;
  startBenchmark: (seconds: number) => void;
}

// One benchmark run: the same raw pose is fed to three dedicated smoothers (separate from the
// drawing one) so Raw / EMA / One Euro can be compared on identical input.
interface BenchmarkRecorder {
  // Both set on the first recorded frame, so a run always covers `durationS` of loop time.
  startedAt: string | null;
  startMs: number | null;
  durationS: number;
  frames: BenchmarkFrame[];
  raw: PoseSmoother;
  ema: PoseSmoother;
  oneEuro: PoseSmoother;
}

const STATS_INTERVAL_MS = 500;
const LATENCY_WINDOW = 120;
// The benchmark downloads start ~10 s after the click (no user gesture), so the browser may ask
// to allow multiple downloads; spacing them out and revoking the URLs late keeps both files.
const SECOND_DOWNLOAD_DELAY_MS = 300;
const REVOKE_URL_DELAY_MS = 1000;

function downloadText(filename: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), REVOKE_URL_DELAY_MS);
}

// Isolates all MediaPipe + <canvas> rendering logic in one place (coder.md §4: "keep the
// MediaPipe/Canvas rendering logic isolated in its own hook/module — don't tangle real-time
// frame-processing code into general UI components"). TryOnPage/the route only reads `status`.
export function useFaceTracking({
  videoRef,
  canvasRef,
  overlayImageUrl,
  enabled,
  smoothing = "oneEuro",
  filterParams = DEFAULT_FILTER_PARAMS,
  widthFactor = DEFAULT_WIDTH_FACTOR,
  debug = false,
}: UseFaceTrackingOptions): UseFaceTrackingResult {
  const [status, setStatus] = useState<FaceTrackingStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<FaceTrackingStats | null>(null);
  const [isBenchmarking, setIsBenchmarking] = useState(false);
  const overlayImageRef = useRef<HTMLImageElement | null>(null);

  // The render loop reads these through refs so changing them never restarts the camera (the
  // main effect's deps stay [enabled, videoRef, canvasRef]). Synced in effects, never during
  // render (react-hooks/refs) — same pattern as ProductListPage.tsx's updateFiltersRef.
  const smoothingRef = useRef(smoothing);
  const filterParamsRef = useRef(filterParams);
  const widthFactorRef = useRef(widthFactor);
  const debugRef = useRef(debug);
  useEffect(() => {
    smoothingRef.current = smoothing;
    filterParamsRef.current = filterParams;
    widthFactorRef.current = widthFactor;
    debugRef.current = debug;
  });

  const smootherRef = useRef<PoseSmoother | null>(null);
  useEffect(() => {
    smootherRef.current = new PoseSmoother(smoothing, filterParams);
  }, [smoothing, filterParams]);

  const recorderRef = useRef<BenchmarkRecorder | null>(null);
  // True only while the render loop runs (set when it starts, cleared in cleanup), so a benchmark
  // can't be armed while the camera/model is not up — it would never finish.
  const loopRunningRef = useRef(false);

  const startBenchmark = useCallback((seconds: number) => {
    if (recorderRef.current || !loopRunningRef.current) return;
    const params = filterParamsRef.current;
    recorderRef.current = {
      startedAt: null,
      startMs: null,
      durationS: seconds,
      frames: [],
      raw: new PoseSmoother("raw"),
      ema: new PoseSmoother("ema", params, DEFAULT_EMA_ALPHA),
      oneEuro: new PoseSmoother("oneEuro", params),
    };
    setIsBenchmarking(true);
  }, []);

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
    let benchmarkTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let csvTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let faceLandmarker: FaceLandmarker | null = null;
    let delegate: MediaPipeDelegate | null = null;

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

    // Releases the camera as soon as the session cannot go on (error shown), instead of
    // leaving the camera light on until unmount (AC62).
    function stopStream() {
      if (stream) stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }

    async function start() {
      setStatus("requesting-camera");
      setErrorMessage(null);

      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
        });
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
      if (!video) {
        // Callers enable the hook only once <video> is mounted; never keep an orphaned stream,
        // and never leave the status on "requesting-camera".
        stopStream();
        setStatus("error");
        setErrorMessage("Không thể khởi động camera. Vui lòng tải lại trang.");
        return;
      }
      video.srcObject = stream;
      try {
        await video.play();
      } catch {
        if (!cancelled) {
          stopStream();
          setStatus("error");
          setErrorMessage("Không thể phát video từ camera. Vui lòng tải lại trang và thử lại.");
        }
        return;
      }

      if (cancelled) return;

      setStatus("loading-model");
      try {
        const created = await createFaceLandmarker("VIDEO");
        faceLandmarker = created.landmarker;
        delegate = created.delegate;
      } catch {
        if (!cancelled) {
          stopStream();
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
      // Fetched once: the context object survives canvas resizes, and a missing context must not
      // silently kill the loop mid-session.
      const ctx = canvas?.getContext("2d") ?? null;
      if (!canvas || !video || !ctx) {
        // Never leave the status on "loading-model" with the camera still running.
        stopStream();
        setStatus("error");
        setErrorMessage("Không thể khởi động camera. Vui lòng tải lại trang.");
        return;
      }

      const tracker = new LostFaceTracker();
      const fpsMeter = new FpsMeter();
      const latencyStats = new RollingStats(LATENCY_WINDOW);
      let lastVideoTime = -1;
      let lastStatus: FaceTrackingStatus = "loading-model";
      let lastStatsPushMs = 0;
      let lastYaw = 0;

      function updateStatus(next: FaceTrackingStatus) {
        if (next === lastStatus) return;
        lastStatus = next;
        setStatus(next);
      }

      // Hands a finished recording to a macrotask (not the rAF body) that builds the meta and
      // downloads the JSON + CSV files.
      function finishBenchmark(recorder: BenchmarkRecorder) {
        recorderRef.current = null;
        benchmarkTimeoutId = setTimeout(() => {
          benchmarkTimeoutId = null;
          if (cancelled || !video) return;
          const startedAt = recorder.startedAt ?? new Date().toISOString();
          const meta = {
            startedAt,
            durationS: recorder.durationS,
            userAgent: navigator.userAgent,
            delegate,
            videoWidth: video.videoWidth,
            videoHeight: video.videoHeight,
            smoothing: smoothingRef.current,
            filterParams: filterParamsRef.current,
            emaAlpha: DEFAULT_EMA_ALPHA,
            widthFactor: widthFactorRef.current,
          };
          const stamp = startedAt.replace(/[:.]/g, "-");
          downloadText(`vto-benchmark-${stamp}.json`, toJson(meta, recorder.frames), "application/json");
          csvTimeoutId = setTimeout(() => {
            csvTimeoutId = null;
            if (cancelled) return;
            downloadText(`vto-benchmark-${stamp}.csv`, toCsv(recorder.frames), "text/csv");
            setIsBenchmarking(false);
          }, SECOND_DOWNLOAD_DELAY_MS);
        }, 0);
      }

      function renderFrame() {
        if (cancelled || !faceLandmarker || !video || !canvas || !ctx) return;

        if (video.videoWidth === 0 || video.videoHeight === 0) {
          rafId = requestAnimationFrame(renderFrame);
          return;
        }

        // Same video frame as last time → nothing new to detect or draw (AC11).
        if (video.currentTime === lastVideoTime) {
          rafId = requestAnimationFrame(renderFrame);
          return;
        }
        lastVideoTime = video.currentTime;

        if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
        }

        const t0 = performance.now();
        let result: FaceLandmarkerResult;
        try {
          result = faceLandmarker.detectForVideo(video, t0);
        } catch {
          rafId = requestAnimationFrame(renderFrame);
          return;
        }
        const latencyMs = performance.now() - t0;
        latencyStats.push(latencyMs);
        fpsMeter.tick(t0);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const smoother = smootherRef.current;
        const recorder = recorderRef.current;
        const faceCount = result.faceLandmarks.length;
        let rawPose: GlassesPose | null = null;

        if (faceCount > 1) {
          tracker.reset();
          smoother?.reset();
          updateStatus("multiple-faces");
        } else {
          if (faceCount === 1) {
            const matrix = result.facialTransformationMatrixes?.[0];
            rawPose = computeGlassesPose(result.faceLandmarks[0], canvas.width, canvas.height, {
              widthFactor: widthFactorRef.current,
              yaw: matrix ? yawFromMatrix(matrix.data) : undefined,
            });
            lastYaw = rawPose.yaw;
          }

          let out;
          if (rawPose) {
            // A gap longer than the hold window means the filters' history is stale — reset so
            // the glasses don't "slide" from the old position (AC8).
            if (tracker.isLost(t0)) {
              smoother?.reset();
              recorder?.raw.reset();
              recorder?.ema.reset();
              recorder?.oneEuro.reset();
            }
            const smoothed = smoother ? smoother.smooth(rawPose, t0 / 1000) : rawPose;
            out = tracker.update(smoothed, t0);
            updateStatus(rawPose.visible ? "tracking" : "turned-away");
          } else {
            out = tracker.update(null, t0);
            // During the hold window keep the previous status.
            if (out.lost) updateStatus("no-face");
          }

          const overlayImage = overlayImageRef.current;
          if (out.pose && overlayImage?.complete && overlayImage.naturalWidth > 0) {
            const alpha = out.alpha * (out.pose.visible ? 1 : TURNED_AWAY_ALPHA);
            drawGlasses(ctx, overlayImage, out.pose, alpha);
          }
        }

        if (recorder) {
          if (recorder.startMs === null) {
            recorder.startMs = t0;
            recorder.startedAt = new Date().toISOString();
          }
          const tSeconds = t0 / 1000;
          recorder.frames.push({
            tMs: t0 - recorder.startMs,
            latencyMs,
            faceFound: rawPose !== null,
            raw: rawPose ? recorder.raw.smooth(rawPose, tSeconds) : null,
            ema: rawPose ? recorder.ema.smooth(rawPose, tSeconds) : null,
            oneEuro: rawPose ? recorder.oneEuro.smooth(rawPose, tSeconds) : null,
          });
          if (t0 - recorder.startMs >= recorder.durationS * 1000) finishBenchmark(recorder);
        }

        if (debugRef.current && t0 - lastStatsPushMs >= STATS_INTERVAL_MS) {
          lastStatsPushMs = t0;
          setStats({
            fps: fpsMeter.fps(),
            latencyP50: latencyStats.percentile(50),
            latencyP95: latencyStats.percentile(95),
            delegate,
            yawDeg: (lastYaw * 180) / Math.PI,
          });
        }

        rafId = requestAnimationFrame(renderFrame);
      }

      loopRunningRef.current = true;
      rafId = requestAnimationFrame(renderFrame);
    }

    void start();

    return () => {
      cancelled = true;
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (benchmarkTimeoutId !== null) clearTimeout(benchmarkTimeoutId);
      if (csvTimeoutId !== null) clearTimeout(csvTimeoutId);
      // Unmount during a recording drops it.
      recorderRef.current = null;
      loopRunningRef.current = false;
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (faceLandmarker) faceLandmarker.close();
      console.error = originalConsoleError;
    };
  }, [enabled, videoRef, canvasRef]);

  return { status, errorMessage, stats: debug ? stats : null, isBenchmarking, startBenchmark };
}
