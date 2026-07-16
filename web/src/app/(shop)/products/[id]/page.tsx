"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { ProductDetailPage } from "@/components/products/ProductDetailPage";

export default function ProductDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message="Không tìm thấy sản phẩm." />;

  return <ProductDetailPage id={id} />;
}
