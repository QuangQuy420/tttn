"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useFaceTracking } from "@/hooks/useFaceTracking";
import { useProduct } from "@/hooks/useProduct";
import { useProducts } from "@/hooks/useProducts";

interface TryOnPageProps {
  // Omitted for the camera-first landing state (nav's "Thử Kính" tab, no product chosen yet) —
  // present when arriving from a specific product's "Thử kính AR" button.
  id?: string;
}

// Vietnamese hint shown for each non-"tracking" status, mirroring
// face_shape_service.py's MultipleFacesDetectedError wording style (AC5).
const STATUS_HINTS: Partial<Record<string, string>> = {
  "requesting-camera": "Đang yêu cầu quyền truy cập camera...",
  "loading-model": "Đang tải mô hình nhận diện khuôn mặt...",
  "no-face": "Không phát hiện khuôn mặt nào. Vui lòng nhìn thẳng vào camera.",
  "multiple-faces": "Phát hiện nhiều hơn 1 khuôn mặt. Vui lòng chỉ để 1 người trong khung hình.",
};

// How many other products to offer in the switcher/picker strip.
const SWITCHER_LIMIT = 8;

// Thin page component: only wires the product fetch + camera/canvas elements together. All
// MediaPipe/canvas frame-processing logic lives in useFaceTracking (coder.md §4).
export function TryOnPage({ id }: TryOnPageProps) {
  // `activeId` starts at whatever product the user arrived with (null when landing on the tab
  // directly, with no product chosen yet). Picking a frame from the strip below only updates
  // this local state — it never navigates, so the <video>/<canvas> below (and the camera
  // stream/face-tracking session useFaceTracking owns) stay mounted and keep running across a
  // pick/switch instead of re-requesting camera permission each time.
  const [activeId, setActiveId] = useState<string | null>(id ?? null);
  const { product, isLoading, error } = useProduct(activeId);
  const { products: otherProducts } = useProducts({ limit: SWITCHER_LIMIT });
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const thumbnail = product?.images.find((image) => image.isThumbnail) ?? product?.images[0];

  const { status, errorMessage } = useFaceTracking({
    videoRef,
    canvasRef,
    overlayImageUrl: thumbnail?.imageUrl ?? null,
    // Camera-first (Q: "Thử Kính" nav tab): the camera starts right away even with no frame
    // picked yet — useFaceTracking already no-ops the draw step whenever overlayImageUrl is
    // null, so this just shows a plain live tracking preview until a frame is chosen.
    enabled: true,
  });

  // Once the camera view has rendered once, it must never be replaced by a full-page
  // loading/error state again — that would unmount the <video>/<canvas> the running camera
  // stream is attached to, orphaning it (the freshly re-mounted <video> has no srcObject, so it
  // just shows solid black). This bit latches permanently true the first time `cameraReady`
  // clears, so a *later* switch's loading/error never re-triggers it, even though `product`
  // briefly reads null while that switch's fetch is in flight, same as it did before anything
  // ever loaded. Setting state during render like this (guarded so it only fires on the render
  // where the condition first flips) is React's documented pattern for state that needs to
  // remember "has this ever been true" — a ref can't be read/written during render
  // (react-hooks/refs), and syncing it from a useEffect instead re-triggers
  // react-hooks/set-state-in-effect. See https://react.dev/learn/you-might-not-need-an-effect.
  const cameraReady = activeId === null || Boolean(product);
  const [hasShownCamera, setHasShownCamera] = useState(cameraReady);
  if (cameraReady && !hasShownCamera) {
    setHasShownCamera(true);
  }

  if (!hasShownCamera) {
    // Only a chosen product (activeId set, e.g. arrived via a product's "Thử kính AR" button)
    // can fail to load — landing on the tab with no product picked at all is not an error
    // state, so it's excluded here rather than blocking the whole camera-first page.
    if (activeId && isLoading && !product) return <LoadingState label="Đang tải sản phẩm..." />;
    if (activeId && error && !product) return <ErrorState message={error} />;
  }

  // A switch that fails after the camera is already showing shouldn't blank the page (see
  // above) — surface it as a small inline notice next to the switcher instead, keeping
  // whichever frame was showing before the failed switch.
  const switchError = hasShownCamera && activeId && error && !product ? error : null;

  const hint = status === "camera-denied" || status === "unsupported" || status === "error"
    ? errorMessage
    : STATUS_HINTS[status];

  const switchableProducts = otherProducts.filter((item) => item.id !== activeId);

  return (
    <section aria-labelledby="try-on-heading" className="face-analysis">
      {product && (
        <Link href={`/products/${product.id}`} className="product-detail__back-link">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          Về trang sản phẩm
        </Link>
      )}

      <p className="face-analysis__eyebrow">Thử kính AR</p>
      <h1 id="try-on-heading" className="face-analysis__title">
        {product ? `Thử kính ${product.name}` : "Thử kính AR"}
      </h1>
      <p className="face-analysis__subtitle">
        {product
          ? "Cho phép camera để xem gọng kính này theo dõi khuôn mặt của bạn trực tiếp trên trình duyệt — không có hình ảnh hay video nào được gửi lên máy chủ."
          : "Cho phép camera, sau đó chọn 1 gọng kính bên dưới để xem gọng kính đó theo dõi khuôn mặt của bạn trực tiếp trên trình duyệt — không có hình ảnh hay video nào được gửi lên máy chủ."}
      </p>

      <div className="face-analysis__card">
        <div className="try-on__video-frame">
          <video ref={videoRef} className="try-on__video" playsInline muted aria-hidden="true" />
          <canvas ref={canvasRef} className="try-on__canvas" aria-hidden="true" />
        </div>
        {hint && (
          <p role="status" className="try-on__hint">
            {hint}
          </p>
        )}
        {product && (
          <div className="product-detail__actions try-on__actions">
            <button
              type="button"
              className="btn btn--outline"
              disabled
              title="Sắp ra mắt"
              aria-label="Thêm vào giỏ hàng (sắp ra mắt)"
            >
              Thêm vào giỏ hàng
            </button>
          </div>
        )}
      </div>

      {switchableProducts.length > 0 && (
        <div className="face-analysis__card">
          <p className="face-analysis__section-label">
            {product ? "Thử sản phẩm khác" : "Chọn 1 gọng kính để thử"}
          </p>
          {switchError && (
            <p role="status" className="try-on__hint">
              {switchError}
            </p>
          )}
          <div className="try-on__switcher">
            {switchableProducts.map((item) => {
              const itemThumbnail =
                item.images.find((image) => image.isThumbnail) ?? item.images[0];
              return (
                <button
                  key={item.id}
                  type="button"
                  className="try-on__switcher-item"
                  onClick={() => setActiveId(item.id)}
                  aria-label={`Thử kính ${item.name}`}
                >
                  {itemThumbnail ? (
                    <ImageWithFallback
                      src={itemThumbnail.imageUrl}
                      alt={item.name}
                      className="try-on__switcher-image"
                      placeholderClassName="try-on__switcher-image try-on__switcher-placeholder"
                    />
                  ) : (
                    <div className="try-on__switcher-image try-on__switcher-placeholder" />
                  )}
                  <span className="try-on__switcher-name">{item.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
