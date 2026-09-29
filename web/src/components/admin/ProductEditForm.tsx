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
import { getAccessToken } from "@/lib/auth/session";
import {
  FRAME_SHAPES,
  GENDER_TARGETS,
  formatFrameShapeVi,
  GENDER_TARGET_LABELS_VI,
  MATERIAL_TYPE_LABELS_VI,
  MATERIAL_TYPES,
} from "@/lib/labels";
import type { Brand } from "@/types/product";
import type { Category } from "@/types/category";
import type {
  FaceShapeTag,
  FrameShape,
  GenderTarget,
  MaterialType,
  Product,
  ProductStatus,
} from "@/types/product";
import { FaceShapeTagPicker } from "./FaceShapeTagPicker";
import { ProductImageManager } from "./ProductImageManager";
import { ProductVariantsEditor } from "./ProductVariantsEditor";
import type { ProductVariant } from "@/types/product";

interface ProductEditFormProps {
  product: Product | null;
}

type MeasurementKey = "lensWidthMm" | "bridgeWidthMm" | "templeLengthMm" | "frameWidthMm";

interface MeasurementField {
  key: MeasurementKey;
  label: string;
  min: number;
  max: number;
}

// Frame measurements in mm (integers) — ranges mirror product-service's CreateProductDto.
const MEASUREMENT_FIELDS: MeasurementField[] = [
  { key: "lensWidthMm", label: "Rộng tròng", min: 40, max: 65 },
  { key: "bridgeWidthMm", label: "Cầu mũi", min: 12, max: 26 },
  { key: "templeLengthMm", label: "Chiều dài càng", min: 120, max: 160 },
  { key: "frameWidthMm", label: "Tổng chiều ngang", min: 110, max: 160 },
];

function toMeasurementInput(value: number | null | undefined): string {
  return value == null ? "" : String(value);
}

interface FormState {
  name: string;
  categoryId: string;
  brandId: string;
  frameShape: FrameShape;
  genderTarget: GenderTarget;
  material: string;
  materialType: MaterialType | "";
  lensWidthMm: string;
  bridgeWidthMm: string;
  templeLengthMm: string;
  frameWidthMm: string;
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
    material: "",
    materialType: "",
    lensWidthMm: "",
    bridgeWidthMm: "",
    templeLengthMm: "",
    frameWidthMm: "",
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
    material: product.material ?? "",
    materialType: product.materialType ?? "",
    lensWidthMm: toMeasurementInput(product.lensWidthMm),
    bridgeWidthMm: toMeasurementInput(product.bridgeWidthMm),
    templeLengthMm: toMeasurementInput(product.templeLengthMm),
    frameWidthMm: toMeasurementInput(product.frameWidthMm),
    basePrice: String(product.basePrice),
    description: product.description ?? "",
    faceFitNote: product.faceFitNote ?? "",
    faceShapes: product.faceShapes,
    status: product.status === "ARCHIVED" ? "ARCHIVED" : "PUBLISHED",
  };
}

// Shared create/edit form (T18), matching Product Edit.dc.html's field set, order, and Vietnamese
// labels. `product === null` means "create" (isNew); otherwise the form is prefilled for edit.
export function ProductEditForm({ product }: ProductEditFormProps) {
  const router = useRouter();
  const isNew = product === null;

  const [form, setForm] = useState<FormState>(product ? formFromProduct(product) : blankForm());
  // Once a new product is created, further image uploads attach to this id (uploads need an
  // existing product — see ImageUploadSlot). Starts as the existing product's id in edit mode.
  const [savedProductId, setSavedProductId] = useState<string | null>(product?.id ?? null);
  // Same "needs an existing product" constraint as image uploads — see ProductVariantsEditor.
  const [variants, setVariants] = useState<ProductVariant[]>(product?.variants ?? []);

  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadOptions() {
      try {
        // Select options: ask for the API max so every category/brand shows up.
        const [categoryPage, brandPage] = await Promise.all([
          getCategories({ limit: 100 }),
          getBrands({ limit: 100 }),
        ]);
        if (cancelled) return;
        const categoryList = categoryPage.data;
        const brandList = brandPage.data;
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

    // Empty = not entered (null); otherwise a whole number within the field's range.
    const measurements = {} as Record<MeasurementKey, number | null>;
    for (const field of MEASUREMENT_FIELDS) {
      const raw = form[field.key].trim();
      if (!raw) {
        measurements[field.key] = null;
        continue;
      }
      const value = Number(raw);
      if (!Number.isInteger(value) || value < field.min || value > field.max) {
        setError(
          `${field.label} phải là số nguyên từ ${field.min} đến ${field.max} mm.`,
        );
        return;
      }
      measurements[field.key] = value;
    }

    const payload = {
      name: form.name.trim(),
      categoryId: form.categoryId,
      brandId: form.brandId,
      frameShape: form.frameShape,
      genderTarget: form.genderTarget,
      material: form.material.trim() || null,
      materialType: form.materialType || null,
      ...measurements,
      basePrice,
      description: form.description.trim() || null,
      faceFitNote: form.faceFitNote.trim() || null,
      faceShapes: form.faceShapes,
      status: form.status,
    };

    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (savedProductId) {
        await updateProduct(savedProductId, payload, token);
      } else {
        const created = await createProduct(payload, token);
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
              <ProductImageManager
                productId={savedProductId}
                variantId={null}
                maxCount={8}
                images={product?.images.filter((image) => image.variantId === null) ?? []}
                onChange={() => {}}
              />
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

              <div className="admin-form-row">
                <div>
                  <label className="admin-form-field" htmlFor="product-gender">
                    Đối tượng
                  </label>
                  <select
                    id="product-gender"
                    className="admin-form-select"
                    value={form.genderTarget}
                    onChange={(event) =>
                      updateField("genderTarget", event.target.value as GenderTarget)
                    }
                  >
                    {GENDER_TARGETS.map((gender) => (
                      <option key={gender} value={gender}>
                        {GENDER_TARGET_LABELS_VI[gender]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="admin-form-field" htmlFor="product-material">
                    Chất liệu
                  </label>
                  <input
                    id="product-material"
                    className="admin-form-input"
                    value={form.material}
                    onChange={(event) => updateField("material", event.target.value)}
                  />
                </div>
              </div>

              <div className="admin-form-row">
                <div>
                  <label className="admin-form-field" htmlFor="product-material-type">
                    Loại chất liệu
                  </label>
                  <select
                    id="product-material-type"
                    className="admin-form-select"
                    value={form.materialType}
                    onChange={(event) =>
                      updateField("materialType", event.target.value as MaterialType | "")
                    }
                  >
                    <option value="">Chưa chọn</option>
                    {MATERIAL_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {MATERIAL_TYPE_LABELS_VI[type]}
                      </option>
                    ))}
                  </select>
                </div>
                <div />
              </div>

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
              <div className="admin-form-card__title">Kích thước gọng (mm)</div>
              <div className="admin-form-row admin-form-row--wrap">
                {MEASUREMENT_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label className="admin-form-field" htmlFor={`product-${field.key}`}>
                      {field.label} ({field.min}–{field.max})
                    </label>
                    <input
                      id={`product-${field.key}`}
                      type="number"
                      min={field.min}
                      max={field.max}
                      step="1"
                      className="admin-form-input"
                      value={form[field.key]}
                      onChange={(event) => updateField(field.key, event.target.value)}
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="admin-form-card">
              <div className="admin-form-card__title">Phù hợp với dáng mặt</div>
              <FaceShapeTagPicker
                selected={form.faceShapes}
                onChange={(next) => updateField("faceShapes", next)}
              />
            </div>

            <div className="admin-form-card">
              <div className="admin-form-card__title">Biến thể (màu sắc / kích thước / tồn kho)</div>
              <ProductVariantsEditor
                productId={savedProductId}
                variants={variants}
                images={product?.images ?? []}
                onChange={setVariants}
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
