# Dockerfile — face-processing-service (Python + FastAPI + MediaPipe)
FROM python:3.11-slim AS base

# System libs required by MediaPipe / OpenCV.
# libgles2/libegl1: required by mediapipe's Task API (mediapipe.tasks.vision.FaceLandmarker,
# used by app/services/face_shape_service.py) to load its native bindings — verified by
# directly running the built image, which failed with
# "OSError: libGLESv2.so.2: cannot open shared object file" / "libEGL.so.1: ..." without them.
# curl: lets Compose's healthcheck curl GET /health (python:3.11-slim ships neither curl nor
# wget by default — verified via `docker run --rm python:3.11-slim sh -c "which curl; which wget"`).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgles2 libegl1 curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# MediaPipe FaceLandmarker model asset — downloaded at build time (not at request time) so
# there's no runtime network dependency / missing-file surprise on first request.
RUN mkdir -p models && curl -fsSL -o models/face_landmarker.task \
    https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task

COPY . .
RUN chmod +x entrypoint.sh
EXPOSE 8000

# Runs pending Alembic migrations before the app starts (see entrypoint.sh) — every
# `docker compose up`, not just the first one.
ENTRYPOINT ["./entrypoint.sh"]

# `dev` target: used by infra/docker-compose.watch.yml (docker compose watch) for hot-reload
# during local development — uvicorn's own `--reload` picks up files synced in by `watch`.
FROM base AS dev
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

FROM base
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
