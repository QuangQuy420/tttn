"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { SagaLogDetailPage } from "@/components/admin/SagaLogDetailPage";

export default function AdminSagaLogDetail() {
  const params = useParams<{ date: string; orderId: string }>();
  const date = params.date;
  const orderId = params.orderId;

  if (!date || !orderId) return <ErrorState message="Không tìm thấy đơn hàng." />;

  return <SagaLogDetailPage orderId={orderId} date={date} />;
}
