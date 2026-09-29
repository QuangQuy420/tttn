"use client";

import { useState } from "react";
import { useWishlist } from "@/hooks/useWishlist";
import { ApiError } from "@/lib/api";

interface WishlistButtonProps {
  productId: string;
  className?: string;
}

// ❤ toggle for a product card / the detail page. Disabled while its own request is in flight so
// a quick double click can't like-then-unlike.
export function WishlistButton({ productId, className }: WishlistButtonProps) {
  const { isLiked, toggle } = useWishlist();
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const liked = isLiked(productId);

  async function handleClick() {
    setIsPending(true);
    setError(null);
    try {
      await toggle(productId);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Không thể cập nhật danh sách yêu thích.");
    } finally {
      setIsPending(false);
    }
  }

  return (
    <button
      type="button"
      className={`wishlist-button${liked ? " wishlist-button--active" : ""}${className ? ` ${className}` : ""}`}
      aria-pressed={liked}
      aria-label="Yêu thích"
      title={error ?? (liked ? "Bỏ yêu thích" : "Thêm vào yêu thích")}
      onClick={() => void handleClick()}
      disabled={isPending}
    >
      <span aria-hidden="true">{liked ? "♥" : "♡"}</span>
    </button>
  );
}
