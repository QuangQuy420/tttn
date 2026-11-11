# web

**Storefront** — Next.js + TypeScript. Catalog browsing, auth UI, photo upload, face-shape
result, recommendations, and **virtual try-on (AR)** running client-side. Light admin (stretch).

> The Next.js app (`package.json`, app files) is initialised with the implementation;
> this repo currently holds the folder structure only.

## Responsibilities
- Storefront: product list/detail, cart, checkout, order history.
- Auth UI (register/login, session handling).
- Upload page → face analysis result + measurements.
- "Recommended for your face" section (calls `recommendation-service`).
- Virtual try-on: MediaPipe Tasks Vision (JS) in the browser, overlay frames on the webcam
  feed in real time (Canvas 2D MVP → Three.js 3D stretch).

## Structure
```
src/
  app/            # Next.js routes/pages (catalog, detail, cart, checkout, upload, try-on, admin)
  components/     # reusable UI components (incl. the try-on component)
  lib/
    api/          # API client layer — talks ONLY to the gateway (single base URL)
  hooks/          # React hooks (auth/session, data fetching)
  types/          # shared TypeScript types (mirror infra/contracts)
public/           # static assets (frame PNGs / .glb models for try-on)
```

## Notes
- All requests go through the gateway: `NEXT_PUBLIC_API_BASE_URL` (see [`.env.example`](.env.example)).
- **Webcam requires `localhost` or HTTPS** — open the app at `http://localhost:3000`.
- Real-time AR runs entirely client-side (no per-frame server round-trip).

## Virtual try-on
Pipeline (`src/lib/vto/*` pure math, `src/hooks/useFaceTracking.ts` live loop):
- MediaPipe Face Landmarker (GPU delegate, falls back to CPU) detects once per new video frame.
- The glasses are anchored on the nose bridge (landmark 168), width = factor × outer-eye-corner
  distance (1.55, or `frameWidthMm / 90` clamped to [1.3, 1.8]), rotated by roll and squeezed by
  cos(yaw). Past 45° of yaw they fade to 0.3 with a "turn to the camera" hint.
- A One Euro filter (or EMA / raw) smooths x, y, width, roll and yaw.
- A lost face holds the last pose for 300 ms, then fades out over 250 ms; a longer gap resets the filter.
- The static-photo try-on (`useStaticFaceOverlay`) uses the same placement, without smoothing.

**Debug / benchmark:** open the try-on page with `?debug=1` to show FPS, detect latency p50/p95,
the delegate and yaw, pick Raw / EMA / One Euro, tune `minCutoff` / `beta`, and record a 10 s
benchmark. It downloads `vto-benchmark-<ISO>.json` (`meta`: start time, duration, user agent,
delegate, video size, smoothing, filter params, EMA alpha, width factor; `summary`: frames, mean
FPS, latency mean/p50/p95, face-found ratio, jitter (px std-dev of cx/cy/width) for Raw/EMA/One
Euro; `frames`: per-frame data) and `vto-benchmark-<ISO>.csv` (one row per frame:
`t_ms,latency_ms,face_found,raw_*,ema_*,oneeuro_*`). Jitter is only meaningful when the head is
held still for the whole recording. Files stay on your machine — nothing is uploaded. The
browser may ask to allow multiple downloads for the site — allow it, otherwise the `.csv` can be
dropped.

**Self-hosting MediaPipe:** by default the wasm runtime and model load from the CDN. To serve
them locally, run `scripts/fetch-mediapipe-assets.sh` from `web/` (copies the wasm into
`public/mediapipe/wasm/` and downloads `public/mediapipe/face_landmarker.task`), then set
`NEXT_PUBLIC_MEDIAPIPE_BASE=/mediapipe` in `.env.local` (dev / manual builds only; not wired into
docker compose).
