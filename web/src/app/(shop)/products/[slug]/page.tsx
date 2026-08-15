"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { ProductDetailPage } from "@/components/products/ProductDetailPage";

export default function ProductDetail() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;

  if (!slug) return <ErrorState message="Không tìm thấy sản phẩm." />;

  return <ProductDetailPage slug={slug} />;
}
