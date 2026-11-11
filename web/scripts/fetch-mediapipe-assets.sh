#!/usr/bin/env bash
# Copies the MediaPipe Tasks Vision wasm runtime and downloads the Face Landmarker model into
# public/mediapipe/ so they can be self-hosted with NEXT_PUBLIC_MEDIAPIPE_BASE=/mediapipe.
# Run from web/ (after npm install).
set -euo pipefail

MODEL_URL="https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task"
SRC_WASM="node_modules/@mediapipe/tasks-vision/wasm"
DEST="public/mediapipe"

if [ ! -d "$SRC_WASM" ]; then
  echo "Missing $SRC_WASM — run this from web/ after npm install." >&2
  exit 1
fi

mkdir -p "$DEST/wasm"
cp -R "$SRC_WASM/." "$DEST/wasm/"
curl -fL "$MODEL_URL" -o "$DEST/face_landmarker.task"

echo "MediaPipe assets ready in $DEST. Set NEXT_PUBLIC_MEDIAPIPE_BASE=/mediapipe to use them."
