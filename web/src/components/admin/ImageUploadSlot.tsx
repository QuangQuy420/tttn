"use client";

import { useState } from "react";
import { ApiError, uploadProductImage, type ImageSlot } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";

interface ImageUploadSlotProps {
  productId: string | null;
  slot: ImageSlot;
  placeholder: string;
  imageUrl: string | null;
  onUploaded: (imageUrl: string) => void;
  small?: boolean;
}

// Single image slot (T19): shows the current image if one exists, else a placeholder; on file
// select, uploads it via uploadProductImage for this slot. Disabled until the product has an id
// (uploads attach to an existing product — a brand-new product must be saved first).
export function ImageUploadSlot({
  productId,
  slot,
  placeholder,
  imageUrl,
  onUploaded,
  small,
}: ImageUploadSlotProps) {
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !productId) return;

    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setIsUploading(true);
    setError(null);
    try {
      const image = await uploadProductImage(productId, slot, file, token);
      onUploaded(image.imageUrl);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tải ảnh lên thất bại.");
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div>
      <label className={`admin-image-slot${small ? " admin-image-slot--small" : ""}`}>
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- MinIO-hosted URL, not a Next-optimizable local asset.
          <img src={imageUrl} alt={placeholder} className="admin-image-slot__image" />
        ) : (
          <span className="admin-image-slot__placeholder">
            {isUploading ? "Đang tải…" : placeholder}
          </span>
        )}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          className="admin-image-slot__input"
          disabled={!productId || isUploading}
          onChange={handleFileChange}
          aria-label={placeholder}
        />
      </label>
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
