"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { ProductDetailPage } from "@/components/products/ProductDetailPage";

export default function ProductDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message="Product not found." />;

  return <ProductDetailPage id={id} />;
}
