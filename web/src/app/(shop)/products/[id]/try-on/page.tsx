"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { TryOnPage } from "@/components/tryon/TryOnPage";

export default function ProductTryOn() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message="Không tìm thấy sản phẩm." />;

  return <TryOnPage id={id} />;
}
