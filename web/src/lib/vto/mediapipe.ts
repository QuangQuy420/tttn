import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import { MAX_FACES_TO_DETECT } from "./landmarks";

// Google's CDN copies of the MediaPipe WASM runtime + Face Landmarker model (simplest for a dev
// machine with internet access). Set NEXT_PUBLIC_MEDIAPIPE_BASE (e.g. "/mediapipe", filled by
// scripts/fetch-mediapipe-assets.sh) to self-host both instead.
const MEDIAPIPE_BASE = process.env.NEXT_PUBLIC_MEDIAPIPE_BASE?.replace(/\/+$/, "");

export const WASM_BASE_URL = MEDIAPIPE_BASE
  ? `${MEDIAPIPE_BASE}/wasm`
  : "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm";
export const MODEL_ASSET_PATH = MEDIAPIPE_BASE
  ? `${MEDIAPIPE_BASE}/face_landmarker.task`
  : "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task";

export type MediaPipeDelegate = "GPU" | "CPU";

// Tries the GPU delegate first and retries once on CPU if that throws; a second failure
// propagates to the caller. A GPU init that fails without throwing is not detected.
export async function createFaceLandmarker(
  runningMode: "VIDEO" | "IMAGE",
): Promise<{ landmarker: FaceLandmarker; delegate: MediaPipeDelegate }> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const wasmFileset = await FilesetResolver.forVisionTasks(WASM_BASE_URL);

  const create = (delegate: MediaPipeDelegate) =>
    FaceLandmarker.createFromOptions(wasmFileset, {
      baseOptions: { modelAssetPath: MODEL_ASSET_PATH, delegate },
      runningMode,
      numFaces: MAX_FACES_TO_DETECT,
      outputFacialTransformationMatrixes: true,
    });

  try {
    return { landmarker: await create("GPU"), delegate: "GPU" };
  } catch {
    return { landmarker: await create("CPU"), delegate: "CPU" };
  }
}
