# face-processing-service

**Face Processing Service** — Python + FastAPI + MediaPipe. Detects facial landmarks from an
uploaded photo and classifies the **face shape** with measurements.

## Responsibilities
- `POST /analyze` — accepts an image → returns landmarks + measurements
  (face length, forehead/cheekbone/jaw width, ratios) + `faceShape`
  (`oval | round | square | heart | oblong | diamond`) with a confidence/explanation.
- Validates the image (format, exactly one face) and handles "no face" errors.
- Stores the uploaded image in **S3 (MinIO locally)** — private bucket, presigned URL,
  with a lifecycle/delete policy.

## Structure (router → service → repository → db, with DI / SOLID)
```
app/
  routers/        # FastAPI routers, request/response wiring
  services/       # landmark extraction, face-shape classification (rule-based)
  repositories/   # S3/MinIO image storage access (interface + impl)
  db/             # (optional) analysis metadata persistence
  schemas/        # Pydantic DTOs (request/response models)
  core/           # config (pydantic-settings), DI, app bootstrap
tests/            # unit tests incl. face-shape classifier thresholds
```
> `app/main.py` (FastAPI entrypoint) is added with the implementation.

## Notes
- Face-shape thresholds are documented for the thesis report.
- MediaPipe/OpenCV need system libs (`libgl1`, `libglib2.0-0`) — already in the Dockerfile.
- See [`.env.example`](.env.example) for S3/MinIO settings.
