"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Reads/writes the 1-based `?page=` URL param, keeping every other param as-is, so a list page is
// shareable and the browser back button moves between pages. Page 1 is kept out of the URL.
// Uses useSearchParams(), so the calling page must render inside a <Suspense> boundary.
export function usePageParam(): [number, (page: number) => void] {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const parsed = Number(searchParams.get("page"));
  const page = Number.isInteger(parsed) && parsed >= 1 ? parsed : 1;

  function setPage(nextPage: number) {
    const params = new URLSearchParams(searchParams.toString());
    if (nextPage > 1) params.set("page", String(nextPage));
    else params.delete("page");
    const query = params.toString();
    router.push(query ? `${pathname}?${query}` : pathname);
  }

  return [page, setPage];
}
