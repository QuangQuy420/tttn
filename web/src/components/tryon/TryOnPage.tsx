"use client";

import Link from "next/link";
import { useRef } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useFaceTracking } from "@/hooks/useFaceTracking";
import { useProduct } from "@/hooks/useProduct";

interface TryOnPageProps {
  id: string;
}

// Vietnamese hint shown for each non-"tracking" status, mirroring
// face_shape_service.py's MultipleFacesDetectedError wording style (AC5).
const STATUS_HINTS: Partial<Record<string, string>> = {
  "requesting-camera": "Đang yêu cầu quyền truy cập camera...",
  "loading-model": "Đang tải mô hình nhận diện khuôn mặt...",
  "no-face": "Không phát hiện khuôn mặt nào. Vui lòng nhìn thẳng vào camera.",
  "multiple-faces": "Phát hiện nhiều hơn 1 khuôn mặt. Vui lòng chỉ để 1 người trong khung hình.",
};

// Thin page component: only wires the product fetch + camera/canvas elements together. All
// MediaPipe/canvas frame-processing logic lives in useFaceTracking (coder.md §4).
export function TryOnPage({ id }: TryOnPageProps) {
  const { product, isLoading, error } = useProduct(id);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const thumbnail = product?.images.find((image) => image.isThumbnail) ?? product?.images[0];

  const { status, errorMessage } = useFaceTracking({
    videoRef,
    canvasRef,
    overlayImageUrl: thumbnail?.imageUrl ?? null,
    enabled: Boolean(product),
  });

  if (isLoading) return <LoadingState label="Đang tải sản phẩm..." />;
  if (error) return <ErrorState message={error} />;
  if (!product) return <ErrorState message="Không tìm thấy sản phẩm." />;

  const hint = status === "camera-denied" || status === "unsupported" || status === "error"
    ? errorMessage
    : STATUS_HINTS[status];

  return (
    <section aria-labelledby="try-on-heading" className="face-analysis">
      <Link href={`/products/${product.id}`} className="product-detail__back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M19 12H5M12 19l-7-7 7-7" />
        </svg>
        Về trang sản phẩm
      </Link>

      <p className="face-analysis__eyebrow">Thử kính AR</p>
      <h1 id="try-on-heading" className="face-analysis__title">
        Thử kính {product.name}
      </h1>
      <p className="face-analysis__subtitle">
        Cho phép camera để xem gọng kính này theo dõi khuôn mặt của bạn trực tiếp trên trình
        duyệt — không có hình ảnh hay video nào được gửi lên máy chủ.
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
      </div>
    </section>
  );
}
