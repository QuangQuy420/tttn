"use client";

import { useParams } from "next/navigation";
import { ProductEditForm } from "@/components/admin/ProductEditForm";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProduct } from "@/hooks/useProduct";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message="Không tìm thấy sản phẩm." />;

  return <EditProductForm id={id} />;
}

function EditProductForm({ id }: { id: string }) {
  const { product, isLoading, error } = useProduct(id);

  if (isLoading) return <LoadingState label="Đang tải sản phẩm..." />;
  if (error || !product) return <ErrorState message={error ?? "Không tìm thấy sản phẩm."} />;

  return <ProductEditForm product={product} />;
}
