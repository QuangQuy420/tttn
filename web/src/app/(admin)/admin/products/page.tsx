"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ApiError, deleteProduct } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useProducts } from "@/hooks/useProducts";
import { getAccessToken } from "@/lib/auth/session";
import { formatFrameShapeVi } from "@/lib/labels";
import { formatPriceVnd } from "@/lib/format/price";

// Admin product list (T17, AC1/AC4) — matches Admin Products.dc.html: stat cards (no AR stat,
// intentionally dropped, see plan Summary), search-by-name, and a table with edit/delete actions.
export default function AdminProductsPage() {
  const [searchInput, setSearchInput] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const { products, isLoading, error, refetch } = useProducts({ includeAllStatuses: true });

  const term = searchInput.trim().toLowerCase();
  const filteredProducts = useMemo(
    () => (term ? products.filter((p) => p.name.toLowerCase().includes(term)) : products),
    [products, term],
  );

  const stats = useMemo(() => {
    const total = products.length;
    const onSale = products.filter((p) => p.status === "PUBLISHED").length;
    const outOfStock = total - onSale;
    return [
      { label: "Tổng sản phẩm", value: total },
      { label: "Đang bán", value: onSale },
      { label: "Hết hàng", value: outOfStock },
    ];
  }, [products]);

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Xoá sản phẩm "${name}"? Hành động này không thể hoàn tác.`)) return;

    const token = getAccessToken();
    if (!token) {
      setDeleteError("Vui lòng đăng nhập lại.");
      return;
    }

    setDeleteError(null);
    setDeletingId(id);
    try {
      await deleteProduct(id, token);
      await refetch();
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Xoá sản phẩm thất bại.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">Quản lý sản phẩm</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        <div className="admin-stats">
          {stats.map((stat) => (
            <div key={stat.label} className="admin-stat-card">
              <div className="admin-stat-card__label">{stat.label}</div>
              <div className="admin-stat-card__value">{stat.value}</div>
            </div>
          ))}
        </div>

        <div className="admin-toolbar">
          <div className="search-field">
            <svg
              className="search-field__icon"
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              type="search"
              className="search-input"
              aria-label="Tìm sản phẩm"
              placeholder="Tìm sản phẩm…"
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
            />
          </div>
          <Link href="/admin/products/new" className="btn btn--primary">
            + Thêm sản phẩm
          </Link>
        </div>

        {deleteError && <ErrorState message={deleteError} />}

        {isLoading && <LoadingState label="Đang tải sản phẩm..." />}
        {!isLoading && error && <ErrorState message={error} />}
        {!isLoading && !error && (
          <div className="admin-table">
            <div className="admin-table__row admin-table__row--head">
              <span></span>
              <span>Sản phẩm</span>
              <span>Kiểu dáng</span>
              <span>Giá</span>
              <span>Trạng thái</span>
              <span></span>
            </div>
            {filteredProducts.map((product) => {
              const thumbnail = product.images.find((image) => image.isThumbnail) ?? product.images[0];
              const isOnSale = product.status === "PUBLISHED";
              return (
                <div key={product.id} className="admin-table__row admin-table__row--body">
                  {thumbnail ? (
                    <ImageWithFallback
                      src={thumbnail.imageUrl}
                      alt={product.name}
                      className="admin-table__thumb"
                      placeholderClassName="admin-table__thumb"
                    />
                  ) : (
                    <div className="admin-table__thumb" role="img" aria-label={product.name} />
                  )}
                  <div>
                    <div className="admin-table__name">{product.name}</div>
                    <div className="admin-table__tag">{product.brand.name}</div>
                  </div>
                  <span className="admin-table__shape">{formatFrameShapeVi(product.frameShape)}</span>
                  <span className="admin-table__price">{formatPriceVnd(product.basePrice)}</span>
                  <span className={`admin-status-badge${isOnSale ? " admin-status-badge--active" : ""}`}>
                    {isOnSale ? "Đang bán" : "Hết hàng"}
                  </span>
                  <div className="admin-table__actions">
                    <Link
                      href={`/admin/products/${product.id}/edit`}
                      className="admin-icon-btn"
                      aria-label={`Sửa ${product.name}`}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 20h9" />
                        <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
                      </svg>
                    </Link>
                    <button
                      type="button"
                      className="admin-icon-btn admin-icon-btn--danger"
                      aria-label={`Xoá ${product.name}`}
                      disabled={deletingId === product.id}
                      onClick={() => handleDelete(product.id, product.name)}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18" />
                        <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <div className="admin-table__empty">
                Không tìm thấy sản phẩm nào khớp với &quot;{searchInput}&quot;.
              </div>
            )}
          </div>
        )}
      </section>
    </>
  );
}
