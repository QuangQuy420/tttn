"use client";

import { useParams } from "next/navigation";
import { ProductEditForm } from "@/components/admin/ProductEditForm";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { useProduct } from "@/hooks/useProduct";
import { getAccessToken } from "@/lib/auth/session";

export default function EditProductPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message="Không tìm thấy sản phẩm." />;

  return <EditProductForm id={id} />;
}

function EditProductForm({ id }: { id: string }) {
  // Token + includeAllStatuses so a DRAFT / ARCHIVED product still opens for editing (AC20).
  const { product, isLoading, error } = useProduct(id, {
    token: getAccessToken(),
    includeAllStatuses: true,
  });

  if (isLoading) return <LoadingState label="Đang tải sản phẩm..." />;
  if (error || !product) return <ErrorState message={error ?? "Không tìm thấy sản phẩm."} />;

  return <ProductEditForm product={product} />;
}
