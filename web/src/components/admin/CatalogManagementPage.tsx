"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import type { Brand, CreateBrandPayload } from "@/types/product";
import type { Category, CreateCategoryPayload } from "@/types/category";

interface ResourceConfig<T extends Brand | Category> {
  title: string;
  searchLabel: string;
  createLabel: string;
  resourceLabel: string;
  getItems: () => Promise<T[]>;
  create: (payload: CreateBrandPayload | CreateCategoryPayload, token: string) => Promise<T>;
  update: (
    id: string,
    payload: CreateBrandPayload | CreateCategoryPayload,
    token: string,
  ) => Promise<T>;
  remove: (id: string, token: string) => Promise<void>;
}

export function CatalogManagementPage<T extends Brand | Category>({
  config,
}: {
  config: ResourceConfig<T>;
}) {
  const configRef = useRef(config);
  const [items, setItems] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<T | null | undefined>(undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function loadItems() {
    setIsLoading(true);
    setLoadError(null);
    try {
      setItems(await config.getItems());
    } catch (error) {
      setLoadError(error instanceof ApiError ? error.message : `Không thể tải ${config.resourceLabel}.`);
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadItemsEffect() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const result = await configRef.current.getItems();
        if (!cancelled) setItems(result);
      } catch (error) {
        if (!cancelled) {
          setLoadError(
            error instanceof ApiError
              ? error.message
              : `Không thể tải ${configRef.current.resourceLabel}.`,
          );
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadItemsEffect();

    return () => {
      cancelled = true;
    };
  }, []);

  const term = search.trim().toLocaleLowerCase("vi");
  const filteredItems = useMemo(
    () => items.filter((item) => !term || item.name.toLocaleLowerCase("vi").includes(term)),
    [items, term],
  );

  async function handleDelete(item: T) {
    if (!window.confirm(`Xoá ${config.resourceLabel} "${item.name}"? Hành động này không thể hoàn tác.`)) {
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setActionError("Bạn cần đăng nhập lại để thực hiện thao tác này.");
      return;
    }

    setActionError(null);
    setDeletingId(item.id);
    try {
      await config.remove(item.id, token);
      await loadItems();
    } catch (error) {
      setActionError(
        error instanceof ApiError
          ? error.message
          : `Không thể xoá ${config.resourceLabel}. Vui lòng thử lại.`,
      );
    } finally {
      setDeletingId(null);
    }
  }

  const isBrand = config.resourceLabel === "thương hiệu";

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">{config.title}</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        <div className="admin-toolbar">
          <div className="search-field">
            <input
              type="search"
              className="search-input"
              aria-label={config.searchLabel}
              placeholder={config.searchLabel}
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <button type="button" className="btn btn--primary" onClick={() => setEditing(null)}>
            + {config.createLabel}
          </button>
        </div>

        {actionError && <ErrorState message={actionError} />}
        {isLoading && <LoadingState label={`Đang tải ${config.resourceLabel}...`} />}
        {!isLoading && loadError && <ErrorState message={loadError} />}
        {!isLoading && !loadError && (
          <div className="admin-table">
            <div className={`admin-table__row admin-table__row--catalog admin-table__row--head${isBrand ? " admin-table__row--brands" : ""}`}>
              <span>Tên</span>
              {isBrand ? <><span>Logo</span><span>Mô tả</span></> : <span>Slug</span>}
              <span></span>
            </div>
            {filteredItems.map((item) => (
              <div key={item.id} className={`admin-table__row admin-table__row--catalog admin-table__row--body${isBrand ? " admin-table__row--brands" : ""}`}>
                <span className="admin-table__name">{item.name}</span>
                {isBrand ? <><span>{(item as Brand).logoUrl || "—"}</span><span>{(item as Brand).description || "—"}</span></> : <span>{(item as Category).slug}</span>}
                <div className="admin-table__actions">
                  <button type="button" className="admin-icon-btn" aria-label={`Sửa ${item.name}`} onClick={() => setEditing(item)}>Sửa</button>
                  <button type="button" className="admin-icon-btn admin-icon-btn--danger" aria-label={`Xoá ${item.name}`} disabled={deletingId === item.id} onClick={() => handleDelete(item)}>
                    {deletingId === item.id ? "..." : "Xoá"}
                  </button>
                </div>
              </div>
            ))}
            {filteredItems.length === 0 && <div className="admin-table__empty">Không tìm thấy {config.resourceLabel} nào phù hợp.</div>}
          </div>
        )}
      </section>

      {editing !== undefined && (
        <CatalogFormModal
          item={editing}
          config={config}
          onClose={() => setEditing(undefined)}
          onSaved={async () => {
            setEditing(undefined);
            await loadItems();
          }}
        />
      )}
    </>
  );
}

function CatalogFormModal<T extends Brand | Category>({
  item,
  config,
  onClose,
  onSaved,
}: {
  item: T | null;
  config: ResourceConfig<T>;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const isBrand = config.resourceLabel === "thương hiệu";
  const [name, setName] = useState(item?.name ?? "");
  const [logoUrl, setLogoUrl] = useState(isBrand && item ? (item as Brand).logoUrl ?? "" : "");
  const [description, setDescription] = useState(isBrand && item ? (item as Brand).description ?? "" : "");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit() {
    const trimmedName = name.trim();
    if (!trimmedName) {
      setSubmitError(`Vui lòng nhập tên ${config.resourceLabel}.`);
      return;
    }
    if (isBrand && logoUrl.trim()) {
      try {
        new URL(logoUrl.trim());
      } catch {
        setSubmitError("URL logo không hợp lệ.");
        return;
      }
    }

    const token = getAccessToken();
    if (!token) {
      setSubmitError("Bạn cần đăng nhập lại để thực hiện thao tác này.");
      return;
    }

    const payload: CreateBrandPayload | CreateCategoryPayload = isBrand
      ? { name: trimmedName, logoUrl: logoUrl.trim() || null, description: description.trim() || null }
      : { name: trimmedName };

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      if (item) {
        await config.update(item.id, payload, token);
      } else {
        await config.create(payload, token);
      }
      await onSaved();
    } catch (error) {
      setSubmitError(error instanceof ApiError ? error.message : `Không thể lưu ${config.resourceLabel}. Vui lòng thử lại.`);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" role="presentation" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="catalog-form-heading" onClick={(event) => event.stopPropagation()}>
        <div className="modal__header">
          <h2 id="catalog-form-heading">{item ? `Sửa ${config.resourceLabel}` : config.createLabel}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        <div className="admin-form-field">
          <label htmlFor="catalog-name">Tên {config.resourceLabel}</label>
          <input id="catalog-name" type="text" className="admin-form-input" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        {isBrand && <>
          <div className="admin-form-field">
            <label htmlFor="catalog-logo">URL logo</label>
            <input id="catalog-logo" type="url" className="admin-form-input" value={logoUrl} onChange={(event) => setLogoUrl(event.target.value)} placeholder="https://..." />
          </div>
          <div className="admin-form-field">
            <label htmlFor="catalog-description">Mô tả</label>
            <textarea id="catalog-description" className="admin-form-textarea" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </div>
        </>}
        {!isBrand && <p className="admin-form-card__status-hint">Slug sẽ được hệ thống tự tạo sau khi lưu.</p>}
        {submitError && <p role="alert" className="error-state">{submitError}</p>}
        <div className="modal__actions">
          <button type="button" className="btn btn--outline" onClick={onClose} disabled={isSubmitting}>Hủy</button>
          <button type="button" className="btn btn--primary" onClick={handleSubmit} disabled={isSubmitting}>{isSubmitting ? "Đang lưu..." : "Lưu"}</button>
        </div>
      </div>
    </div>
  );
}
