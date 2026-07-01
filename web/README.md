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
