"use client";

import { useParams } from "next/navigation";
import { AdminOrderDetailPage } from "@/components/admin/AdminOrderDetailPage";
import { ErrorState } from "@/components/common/ErrorState";

export default function AdminOrderDetail() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  if (!id) return <ErrorState message="Không tìm thấy đơn hàng." />;

  return <AdminOrderDetailPage id={id} />;
}
