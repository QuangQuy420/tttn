"use client";

import { CatalogManagementPage } from "@/components/admin/CatalogManagementPage";
import { createCategory, deleteCategory, getCategories, updateCategory } from "@/lib/api";

export default function AdminCategoriesPage() {
  return <CatalogManagementPage config={{
    title: "Quản lý danh mục",
    searchLabel: "Tìm danh mục…",
    createLabel: "Thêm danh mục",
    resourceLabel: "danh mục",
    getItems: getCategories,
    create: createCategory,
    update: updateCategory,
    remove: deleteCategory,
  }} />;
}
