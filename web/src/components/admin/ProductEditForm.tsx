"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  createProduct,
  getBrands,
  getCategories,
  updateProduct,
} from "@/lib/api";
import {
  FRAME_SHAPES,
  GENDER_TARGETS,
  formatFrameShapeVi,
  GENDER_TARGET_LABELS_VI,
} from "@/lib/labels";
import type { Brand } from "@/types/product";
import type { Category } from "@/types/category";
import type {
  FaceShapeTag,
  FrameShape,
  GenderTarget,
  Product,
  ProductStatus,
} from "@/types/product";
import { FaceShapeTagPicker } from "./FaceShapeTagPicker";
import { ImageUploadSlot } from "./ImageUploadSlot";

interface ProductEditFormProps {
  product: Product | null;
}

interface FormState {
  name: string;
  categoryId: string;
  brandId: string;
  frameShape: FrameShape;
  genderTarget: GenderTarget;
  basePrice: string;
  description: string;
  faceFitNote: string;
  faceShapes: FaceShapeTag[];
  status: ProductStatus;
}

function blankForm(): FormState {
  return {
    name: "",
    categoryId: "",
    brandId: "",
    frameShape: "ROUND",
    genderTarget: "UNISEX",
    basePrice: "",
    description: "",
    faceFitNote: "",
    faceShapes: [],
    // Defaults to "Đang bán" (PUBLISHED) for new products — never left unset.
    status: "PUBLISHED",
  };
}

function formFromProduct(product: Product): FormState {
  return {
    name: product.name,
    categoryId: product.category.id,
    brandId: product.brand.id,
    frameShape: product.frameShape,
    genderTarget: product.genderTarget,
    basePrice: String(product.basePrice),
    description: product.description ?? "",
    faceFitNote: product.faceFitNote ?? "",
    faceShapes: product.faceShapes,
    status: product.status === "ARCHIVED" ? "ARCHIVED" : "PUBLISHED",
  };
}

function imageBySortOrder(product: Product | null, sortOrder: number): string | null {
  if (!product) return null;
  return product.images.find((image) => image.sortOrder === sortOrder)?.imageUrl ?? null;
}

const IMAGE_SLOTS = [
  { slot: "main" as const, sortOrder: 0, placeholder: "Ảnh chính diện" },
  { slot: "angle1" as const, sortOrder: 1, placeholder: "Góc nghiêng" },
  { slot: "angle2" as const, sortOrder: 2, placeholder: "Mặt sau" },
  { slot: "angle3" as const, sortOrder: 3, placeholder: "Trên tay" },
];

// Shared create/edit form (T18), matching Product Edit.dc.html's field set, order, and Vietnamese
// labels. `product === null` means "create" (isNew); otherwise the form is prefilled for edit.
export function ProductEditForm({ product }: ProductEditFormProps) {
  const router = useRouter();
  const isNew = product === null;

  const [form, setForm] = useState<FormState>(product ? formFromProduct(product) : blankForm());
  // Once a new product is created, further image uploads attach to this id (uploads need an
  // existing product — see ImageUploadSlot). Starts as the existing product's id in edit mode.
  const [savedProductId, setSavedProductId] = useState<string | null>(product?.id ?? null);
  const [images, setImages] = useState<Record<number, string | null>>({
    0: imageBySortOrder(product, 0),
    1: imageBySortOrder(product, 1),
    2: imageBySortOrder(product, 2),
    3: imageBySortOrder(product, 3),
  });

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      try {
        const [categoryList, brandList] = await Promise.all([getCategories(), getBrands()]);
        if (cancelled) return;
        setCategories(categoryList);
        setBrands(brandList);
        // Default the selects to the first available option once loaded, for the create form.
        setForm((current) => ({
          ...current,
          categoryId: current.categoryId || categoryList[0]?.id || "",
          brandId: current.brandId || brandList[0]?.id || "",
        }));
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : "Không thể tải danh mục/thương hiệu.");
        }
      }
    }
    void loadOptions();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function toggleStatus() {
    setForm((current) => ({
      ...current,
      status: current.status === "PUBLISHED" ? "ARCHIVED" : "PUBLISHED",
    }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const basePrice = Number(form.basePrice);
    if (!form.name.trim()) {
      setError("Vui lòng nhập tên sản phẩm.");
      return;
    }
    if (!form.categoryId || !form.brandId) {
      setError("Vui lòng chọn danh mục và thương hiệu.");
      return;
    }
    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      setError("Vui lòng nhập giá hợp lệ.");
      return;
    }

    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId,
      brandId: form.brandId,
      frameShape: form.frameShape,
      genderTarget: form.genderTarget,
      basePrice,
      description: form.description.trim() || null,
      faceFitNote: form.faceFitNote.trim() || null,
      faceShapes: form.faceShapes,
      status: form.status,
    };

    setIsSubmitting(true);
    try {
      if (savedProductId) {
        await updateProduct(savedProductId, payload);
      } else {
        const created = await createProduct(payload);
        setSavedProductId(created.id);
      }
      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu sản phẩm thất bại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <>
      <header className="admin-form-header">
        <a href="/admin/products" className="admin-form-header__back">
          ← Quay lại danh sách
        </a>
        <div className="admin-form-header__actions">
          <button
            type="button"
            className="btn btn--outline"
            onClick={() => router.push("/admin/products")}
          >
            Huỷ
          </button>
          <button type="submit" form="product-edit-form" className="btn btn--primary" disabled={isSubmitting}>
            {isSubmitting ? "Đang lưu…" : "Lưu sản phẩm"}
          </button>
        </div>
      </header>

      <form id="product-edit-form" className="admin-form" onSubmit={handleSubmit}>
        <div className="admin-form__title">
          {isNew ? "Thêm sản phẩm mới" : "Chỉnh sửa sản phẩm"}
        </div>
        <div className="admin-form__subtitle">
          {isNew
            ? "Điền thông tin gọng kính để thêm vào danh mục."
            : `Đang chỉnh sửa: ${product.name}`}
        </div>

        {error && <p className="field-error">{error}</p>}

        <div className="admin-form__layout">
          <div className="admin-form__images">
            <div className="admin-image-slots">
              <div className="admin-form-card__title">Hình ảnh sản phẩm</div>
              {!savedProductId && (
                <p className="admin-table__tag">Lưu sản phẩm trước để tải ảnh lên.</p>
              )}
              <ImageUploadSlot
                productId={savedProductId}
                slot="main"
                placeholder="Ảnh chính diện"
                imageUrl={images[0]}
                onUploaded={(url) => setImages((current) => ({ ...current, 0: url }))}
              />
              <div className="admin-image-slot__grid">
                {IMAGE_SLOTS.slice(1).map(({ slot, sortOrder, placeholder }) => (
                  <ImageUploadSlot
                    key={slot}
                    productId={savedProductId}
                    slot={slot}
                    placeholder={placeholder}
                    imageUrl={images[sortOrder]}
                    onUploaded={(url) =>
                      setImages((current) => ({ ...current, [sortOrder]: url }))
                    }
                    small
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="admin-form__fields">
            <div className="admin-form-card">
              <div className="admin-form-card__title">Thông tin cơ bản</div>

              <label className="admin-form-field" htmlFor="product-name">
                Tên sản phẩm
              </label>
              <input
                id="product-name"
                className="admin-form-input"
                value={form.name}
                onChange={(event) => updateField("name", event.target.value)}
              />

              <div className="admin-form-row">
                <div>
                  <label className="admin-form-field" htmlFor="product-category">
                    Danh mục
                  </label>
                  <select
                    id="product-category"
                    className="admin-form-select"
                    value={form.categoryId}
                    onChange={(event) => updateField("categoryId", event.target.value)}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="admin-form-field" htmlFor="product-brand">
                    Thương hiệu
                  </label>
                  <select
                    id="product-brand"
                    className="admin-form-select"
                    value={form.brandId}
                    onChange={(event) => updateField("brandId", event.target.value)}
                  >
                    {brands.map((brand) => (
                      <option key={brand.id} value={brand.id}>
                        {brand.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="admin-form-row">
                <div>
                  <label className="admin-form-field" htmlFor="product-shape">
                    Kiểu dáng gọng
                  </label>
                  <select
                    id="product-shape"
                    className="admin-form-select"
                    value={form.frameShape}
                    onChange={(event) =>
                      updateField("frameShape", event.target.value as FrameShape)
                    }
                  >
                    {FRAME_SHAPES.map((shape) => (
                      <option key={shape} value={shape}>
                        {formatFrameShapeVi(shape)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="admin-form-field" htmlFor="product-price">
                    Giá (VNĐ)
                  </label>
                  <input
                    id="product-price"
                    type="number"
                    min="0"
                    step="1000"
                    className="admin-form-input"
                    value={form.basePrice}
                    onChange={(event) => updateField("basePrice", event.target.value)}
                  />
                </div>
              </div>

              <label className="admin-form-field" htmlFor="product-gender">
                Đối tượng
              </label>
              <select
                id="product-gender"
                className="admin-form-select"
                value={form.genderTarget}
                onChange={(event) => updateField("genderTarget", event.target.value as GenderTarget)}
              >
                {GENDER_TARGETS.map((gender) => (
                  <option key={gender} value={gender}>
                    {GENDER_TARGET_LABELS_VI[gender]}
                  </option>
                ))}
              </select>

              <label className="admin-form-field" htmlFor="product-description">
                Mô tả sản phẩm
              </label>
              <textarea
                id="product-description"
                className="admin-form-textarea"
                rows={4}
                value={form.description}
                onChange={(event) => updateField("description", event.target.value)}
              />

              <label className="admin-form-field" htmlFor="product-fit-note">
                Ghi chú độ phù hợp khuôn mặt
              </label>
              <input
                id="product-fit-note"
                className="admin-form-input"
                value={form.faceFitNote}
                onChange={(event) => updateField("faceFitNote", event.target.value)}
              />
            </div>

            <div className="admin-form-card">
              <div className="admin-form-card__title">Phù hợp với dáng mặt</div>
              <FaceShapeTagPicker
                selected={form.faceShapes}
                onChange={(next) => updateField("faceShapes", next)}
              />
            </div>

            <div className="admin-form-card admin-form-card--status">
              <div>
                <div className="admin-form-card__status-label">Trạng thái bán</div>
                <div className="admin-form-card__status-hint">
                  Ẩn sản phẩm khỏi danh mục nếu hết hàng.
                </div>
              </div>
              <button
                type="button"
                className={`admin-toggle${form.status === "PUBLISHED" ? " admin-toggle--on" : ""}`}
                onClick={toggleStatus}
                aria-pressed={form.status === "PUBLISHED"}
                aria-label="Trạng thái bán"
              >
                <span className="admin-toggle__knob" />
              </button>
            </div>
          </div>
        </div>
      </form>
    </>
  );
}
