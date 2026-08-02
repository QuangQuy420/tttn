"use client";

import { useParams } from "next/navigation";
import { ErrorState } from "@/components/common/ErrorState";
import { SagaLogOrdersPage } from "@/components/admin/SagaLogOrdersPage";

export default function AdminSagaLogOrders() {
  const params = useParams<{ date: string }>();
  const date = params.date;

  if (!date) return <ErrorState message="Không tìm thấy ngày." />;

  return <SagaLogOrdersPage date={date} />;
}
