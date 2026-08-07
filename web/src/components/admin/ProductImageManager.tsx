"use client";

import { useState } from "react";
import {
  ApiError,
  deleteProductImage,
  setProductImageThumbnail,
  uploadProductImage,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import type { ProductImage } from "@/types/product";

interface ProductImageManagerProps {
  productId: string | null;
  // null manages the base product's own image group; a variant id manages that variant's own
  // image group — the two groups are independent (see product-service's per-(productId,
  // variantId) sortOrder/limit grouping).
  variantId: string | null;
  images: ProductImage[];
  maxCount: number;
  onChange: (next: ProductImage[]) => void;
}

// Multi-image manager (T23): replaces the old 4-fixed-slot ImageUploadSlot. Renders the current
// images for one group (append-only, never replaced), each with its own "Đặt làm ảnh đại diện"/
// "Xoá" actions, plus a multi-file upload input that uploads sequentially and stops client-side
// once `maxCount` is reached. Disabled until `productId` exists — uploads attach to an existing
// product/variant, a brand-new one has no id yet.
export function ProductImageManager({
  productId,
  variantId,
  images,
  maxCount,
  onChange,
}: ProductImageManagerProps) {
  const [imageList, setImageList] = useState<ProductImage[]>(images);
  const [isUploading, setIsUploading] = useState(false);
  const [busyImageId, setBusyImageId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isFull = imageList.length >= maxCount;

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0 || !productId) return;

    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setError(null);
    setIsUploading(true);
    let count = imageList.length;
    let blocked = false;
    try {
      for (const file of files) {
        if (count >= maxCount) {
          blocked = true;
          break;
        }
        const uploaded = await uploadProductImage(productId, file, token, variantId ?? undefined);
        count += 1;
        setImageList((current) => {
          const next = [...current, uploaded];
          onChange(next);
          return next;
        });
      }
      if (blocked) {
        setError(`Đã đạt số lượng ảnh tối đa (${maxCount} ảnh) cho mục này, không thể tải thêm.`);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Tải ảnh lên thất bại.");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleSetThumbnail(imageId: string) {
    if (!productId) return;
    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setError(null);
    setBusyImageId(imageId);
    try {
      await setProductImageThumbnail(productId, imageId, token);
      setImageList((current) => {
        const next = current.map((image) => ({ ...image, isThumbnail: image.id === imageId }));
        onChange(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể đặt ảnh đại diện.");
    } finally {
      setBusyImageId(null);
    }
  }

  async function handleDelete(imageId: string) {
    if (!productId) return;
    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setError(null);
    setBusyImageId(imageId);
    try {
      await deleteProductImage(productId, imageId, token);
      setImageList((current) => {
        const next = current.filter((image) => image.id !== imageId);
        onChange(next);
        return next;
      });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể xoá ảnh.");
    } finally {
      setBusyImageId(null);
    }
  }

  return (
    <div className="product-image-manager">
      {imageList.length > 0 && (
        <ul className="product-image-manager__grid">
          {imageList.map((image) => (
            <li key={image.id} className="product-image-manager__item">
              <ImageWithFallback
                src={image.imageUrl}
                alt="Ảnh sản phẩm"
                className="product-image-manager__image"
                placeholderClassName="product-image-manager__image product-image-manager__image--placeholder"
              />
              {image.isThumbnail && (
                <span className="product-image-manager__badge">Ảnh đại diện</span>
              )}
              <div className="product-image-manager__actions">
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => handleSetThumbnail(image.id)}
                  disabled={image.isThumbnail || busyImageId === image.id}
                >
                  Đặt làm ảnh đại diện
                </button>
                <button
                  type="button"
                  className="btn btn--outline btn--small"
                  onClick={() => handleDelete(image.id)}
                  disabled={busyImageId === image.id}
                >
                  Xoá
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <label
        className={`product-image-manager__upload${
          !productId || isUploading || isFull ? " product-image-manager__upload--disabled" : ""
        }`}
      >
        <span>{isUploading ? "Đang tải lên…" : "Tải ảnh lên"}</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={!productId || isUploading || isFull}
          onChange={handleFileChange}
          aria-label="Tải ảnh lên"
        />
      </label>
      {isFull && (
        <p className="admin-table__tag">Đã đạt số lượng ảnh tối đa ({maxCount} ảnh).</p>
      )}
      {error && <p className="field-error">{error}</p>}
    </div>
  );
}
