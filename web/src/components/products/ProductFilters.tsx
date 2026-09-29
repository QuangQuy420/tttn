import { useState } from "react";
import {
  formatFrameShapeVi,
  GENDER_TARGET_LABELS_VI,
  GENDER_TARGETS,
  MATERIAL_TYPE_LABELS_VI,
  MATERIAL_TYPES,
  PRODUCT_SORT_LABELS_VI,
  PRODUCT_SORTS,
} from "@/lib/labels";
import type { Category } from "@/types/category";
import type {
  Brand,
  FrameShape,
  GenderTarget,
  MaterialType,
  ProductSort,
} from "@/types/product";

interface PriceRange {
  label: string;
  minPrice?: number;
  maxPrice?: number;
}

// FR4: fixed price bands (VND), wired to the real minPrice/maxPrice query params.
const PRICE_RANGES: PriceRange[] = [
  { label: "Dưới 1.500.000 ₫", maxPrice: 1_500_000 },
  { label: "1.500.000 – 2.500.000 ₫", minPrice: 1_500_000, maxPrice: 2_500_000 },
  { label: "Trên 2.500.000 ₫", minPrice: 2_500_000 },
];

function isActivePriceRange(
  range: PriceRange,
  minPrice: number | undefined,
  maxPrice: number | undefined,
) {
  return range.minPrice === minPrice && range.maxPrice === maxPrice;
}

interface ProductFiltersProps {
  brands: Brand[];
  categories: Category[];
  frameShapes: FrameShape[];
  brandIds: string[];
  categoryId: string | undefined;
  frameShape: FrameShape | undefined;
  materialType: MaterialType | undefined;
  color: string | undefined;
  genderTarget: GenderTarget | undefined;
  sort: ProductSort | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  onApplyFilters: (filters: ProductFilterValues) => void;
}

interface ProductFilterValues {
  brandIds: string[];
  categoryId: string | undefined;
  frameShape: FrameShape | undefined;
  materialType: MaterialType | undefined;
  color: string | undefined;
  genderTarget: GenderTarget | undefined;
  sort: ProductSort | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
}

export function ProductFilters({
  brands,
  categories,
  frameShapes,
  brandIds,
  categoryId,
  frameShape,
  materialType,
  color,
  genderTarget,
  sort,
  minPrice,
  maxPrice,
  onApplyFilters,
}: ProductFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ProductFilterValues>({
    brandIds,
    categoryId,
    frameShape,
    materialType,
    color,
    genderTarget,
    sort,
    minPrice,
    maxPrice,
  });

  function openFilters() {
    setDraftFilters({
      brandIds,
      categoryId,
      frameShape,
      materialType,
      color,
      genderTarget,
      sort,
      minPrice,
      maxPrice,
    });
    setIsOpen(true);
  }

  function clearFilters() {
    setDraftFilters({
      brandIds: [],
      categoryId: undefined,
      frameShape: undefined,
      materialType: undefined,
      color: undefined,
      genderTarget: undefined,
      sort: undefined,
      minPrice: undefined,
      maxPrice: undefined,
    });
  }

  function toggleBrand(id: string, checked: boolean) {
    setDraftFilters((current) => ({
      ...current,
      brandIds: checked
        ? [...current.brandIds, id]
        : current.brandIds.filter((brandId) => brandId !== id),
    }));
  }

  function applyFilters() {
    onApplyFilters(draftFilters);
    setIsOpen(false);
  }

  return (
    <div className="product-filters">
      <button
        type="button"
        className="product-filters__trigger"
        aria-expanded={isOpen}
        aria-controls="product-filter-panel"
        onClick={openFilters}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 7h16" />
          <path d="M7 12h10" />
          <path d="M10 17h4" />
        </svg>
        Filter
      </button>

      {isOpen && (
        <section
          id="product-filter-panel"
          className="product-filters__panel"
          role="dialog"
          aria-labelledby="product-filter-heading"
        >
          <div className="product-filters__header">
            <h2 id="product-filter-heading">Filter</h2>
            <button
              type="button"
              className="product-filters__close"
              onClick={() => setIsOpen(false)}
              aria-label="Đóng bộ lọc"
            >
              ×
            </button>
          </div>

          <fieldset className="product-filters__field product-filters__brands">
              <legend>Thương hiệu</legend>
              <div className="product-filters__checkboxes">
                {brands.map((brand) => (
                  <label key={brand.id} className="product-filters__checkbox">
                    <input
                      type="checkbox"
                      checked={draftFilters.brandIds.includes(brand.id)}
                      onChange={(event) => toggleBrand(brand.id, event.target.checked)}
                    />
                    {brand.name}
                  </label>
                ))}
              </div>
          </fieldset>

          <label className="product-filters__field" htmlFor="filter-category">
              <span>Danh mục</span>
              <select
                id="filter-category"
                value={draftFilters.categoryId ?? ""}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    categoryId: event.target.value || undefined,
                  }))
                }
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
          </label>

          <label className="product-filters__field" htmlFor="filter-frame-shape">
              <span>Dáng gọng</span>
              <select
                id="filter-frame-shape"
                value={draftFilters.frameShape ?? ""}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    frameShape: (event.target.value as FrameShape) || undefined,
                  }))
                }
              >
                <option value="">Tất cả dáng gọng</option>
                {frameShapes.map((shape) => (
                  <option key={shape} value={shape}>{formatFrameShapeVi(shape)}</option>
                ))}
              </select>
          </label>

          <label className="product-filters__field" htmlFor="filter-material">
              <span>Chất liệu</span>
              <select
                id="filter-material"
                value={draftFilters.materialType ?? ""}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    materialType: (event.target.value as MaterialType) || undefined,
                  }))
                }
              >
                <option value="">Tất cả chất liệu</option>
                {MATERIAL_TYPES.map((type) => (
                  <option key={type} value={type}>{MATERIAL_TYPE_LABELS_VI[type]}</option>
                ))}
              </select>
          </label>

          <label className="product-filters__field" htmlFor="filter-color">
              <span>Màu sắc</span>
              <input
                id="filter-color"
                type="text"
                placeholder="VD: Đen"
                value={draftFilters.color ?? ""}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    color: event.target.value || undefined,
                  }))
                }
              />
          </label>

          <label className="product-filters__field" htmlFor="filter-gender">
              <span>Giới tính</span>
              <select
                id="filter-gender"
                value={draftFilters.genderTarget ?? ""}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    genderTarget: (event.target.value as GenderTarget) || undefined,
                  }))
                }
              >
                <option value="">Tất cả</option>
                {GENDER_TARGETS.map((gender) => (
                  <option key={gender} value={gender}>{GENDER_TARGET_LABELS_VI[gender]}</option>
                ))}
              </select>
          </label>

          <label className="product-filters__field" htmlFor="filter-price">
              <span>Giá tiền</span>
              <select
                id="filter-price"
                value={PRICE_RANGES.findIndex((range) =>
                  isActivePriceRange(range, draftFilters.minPrice, draftFilters.maxPrice),
                ).toString()}
                onChange={(event) => {
                  const range = PRICE_RANGES[Number(event.target.value)];
                  setDraftFilters((current) => ({
                    ...current,
                    minPrice: range?.minPrice,
                    maxPrice: range?.maxPrice,
                  }));
                }}
              >
                <option value="-1">Tất cả mức giá</option>
                {PRICE_RANGES.map((range, index) => (
                  <option key={range.label} value={index}>{range.label}</option>
                ))}
              </select>
          </label>

          <label className="product-filters__field" htmlFor="filter-sort">
              <span>Sắp xếp</span>
              <select
                id="filter-sort"
                value={draftFilters.sort ?? "newest"}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    sort: event.target.value as ProductSort,
                  }))
                }
              >
                {PRODUCT_SORTS.map((option) => (
                  <option key={option} value={option}>{PRODUCT_SORT_LABELS_VI[option]}</option>
                ))}
              </select>
          </label>

          <div className="product-filters__actions">
            <button type="button" className="btn btn--outline" onClick={clearFilters}>
              Xóa bộ lọc
            </button>
            <button type="button" className="btn btn--primary" onClick={applyFilters}>
              Xong
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
