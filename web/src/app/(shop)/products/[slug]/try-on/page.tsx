"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { TryOnPage } from "@/components/tryon/TryOnPage";

export default function ProductTryOn() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  if (!slug) return <ErrorState message="Không tìm thấy sản phẩm." />;

  return <TryOnPage slug={slug} />;
}
