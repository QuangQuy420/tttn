"use client";

import { CatalogManagementPage } from "@/components/admin/CatalogManagementPage";
import { createBrand, deleteBrand, getBrands, updateBrand } from "@/lib/api";

export default function AdminBrandsPage() {
  return <CatalogManagementPage config={{
    title: "Quản lý thương hiệu",
    searchLabel: "Tìm thương hiệu…",
    createLabel: "Thêm thương hiệu",
    resourceLabel: "thương hiệu",
    getItems: getBrands,
    create: createBrand,
    update: updateBrand,
    remove: deleteBrand,
  }} />;
}
