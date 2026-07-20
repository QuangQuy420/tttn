"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { OrderDetailPage } from "@/components/orders/OrderDetailPage";

export default function OrderDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message="Không tìm thấy đơn hàng." />;

  return <OrderDetailPage id={id} />;
}
