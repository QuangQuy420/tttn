"use client";

import { useRouter } from "next/navigation";
import { useSyncExternalStore } from "react";
import { addToWishlist, getWishlistProductIds, removeFromWishlist } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";

// Dispatched after a successful like/unlike, the same way useCart dispatches "cart-change" — lets
// views that don't own the toggle (e.g. the /wishlist page) refetch their list.
export function dispatchWishlistChange(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("wishlist-change"));
  }
}

// Module-level store shared by every useWishlist() instance, so a grid of cards triggers ONE
// GET /wishlist/product-ids request instead of one per card.
const EMPTY_IDS: ReadonlySet<string> = new Set();
let likedIds: ReadonlySet<string> = EMPTY_IDS;
// Token the current ids were loaded (or are loading) for — null means "load on next subscribe".
let loadedToken: string | null = null;
let inFlight: Promise<void> | null = null;
const listeners = new Set<() => void>();

function setLikedIds(next: ReadonlySet<string>): void {
  likedIds = next;
  listeners.forEach((listener) => listener());
}

function withLiked(ids: ReadonlySet<string>, productId: string, liked: boolean): Set<string> {
  const next = new Set(ids);
  if (liked) next.add(productId);
  else next.delete(productId);
  return next;
}

function loadLikedIds(): void {
  const token = getAccessToken();
  if (!token) {
    loadedToken = null;
    inFlight = null;
    if (likedIds.size > 0) setLikedIds(EMPTY_IDS);
    return;
  }
  if (loadedToken === token) return;

  loadedToken = token;
  const request: Promise<void> = getWishlistProductIds(token)
    .then((ids) => {
      if (inFlight === request) setLikedIds(new Set(ids));
    })
    .catch(() => {
      // Hearts just stay empty; allow a retry on the next mount.
      if (inFlight === request) loadedToken = null;
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });
  inFlight = request;
}

function handleAuthChange(): void {
  loadedToken = null;
  inFlight = null;
  setLikedIds(EMPTY_IDS);
  loadLikedIds();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) window.addEventListener("auth-change", handleAuthChange);
  loadLikedIds();

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) window.removeEventListener("auth-change", handleAuthChange);
  };
}

function getSnapshot(): ReadonlySet<string> {
  return likedIds;
}

function getServerSnapshot(): ReadonlySet<string> {
  return EMPTY_IDS;
}

interface UseWishlistResult {
  isLiked: (productId: string) => boolean;
  // Optimistic like/unlike; rolls back and rethrows on error. Logged-out → /login.
  toggle: (productId: string) => Promise<void>;
}

export function useWishlist(): UseWishlistResult {
  const router = useRouter();
  const ids = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  async function toggle(productId: string) {
    const token = getAccessToken();
    if (!token) {
      router.push("/login");
      return;
    }

    const wasLiked = likedIds.has(productId);
    setLikedIds(withLiked(likedIds, productId, !wasLiked));
    try {
      if (wasLiked) await removeFromWishlist(token, productId);
      else await addToWishlist(token, productId);
      dispatchWishlistChange();
    } catch (err) {
      setLikedIds(withLiked(likedIds, productId, wasLiked));
      throw err;
    }
  }

  return { isLiked: (productId: string) => ids.has(productId), toggle };
}
