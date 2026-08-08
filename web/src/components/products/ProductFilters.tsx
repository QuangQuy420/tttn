import { useState } from "react";
import { formatFrameShapeVi } from "@/lib/labels";
import type { Category } from "@/types/category";
import type { Brand, FrameShape } from "@/types/product";

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
  brandId: string | undefined;
  categoryId: string | undefined;
  frameShape: FrameShape | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  onApplyFilters: (filters: ProductFilterValues) => void;
}

interface ProductFilterValues {
  brandId: string | undefined;
  categoryId: string | undefined;
  frameShape: FrameShape | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
}

export function ProductFilters({
  brands,
  categories,
  frameShapes,
  brandId,
  categoryId,
  frameShape,
  minPrice,
  maxPrice,
  onApplyFilters,
}: ProductFiltersProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [draftFilters, setDraftFilters] = useState<ProductFilterValues>({
    brandId,
    categoryId,
    frameShape,
    minPrice,
    maxPrice,
  });

  function openFilters() {
    setDraftFilters({ brandId, categoryId, frameShape, minPrice, maxPrice });
    setIsOpen(true);
  }

  function clearFilters() {
    setDraftFilters({
      brandId: undefined,
      categoryId: undefined,
      frameShape: undefined,
      minPrice: undefined,
      maxPrice: undefined,
    });
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

          <label className="product-filters__field" htmlFor="filter-brand">
              <span>Thương hiệu</span>
              <select
                id="filter-brand"
                value={draftFilters.brandId ?? ""}
                onChange={(event) =>
                  setDraftFilters((current) => ({
                    ...current,
                    brandId: event.target.value || undefined,
                  }))
                }
              >
                <option value="">Tất cả thương hiệu</option>
                {brands.map((brand) => (
                  <option key={brand.id} value={brand.id}>{brand.name}</option>
                ))}
              </select>
          </label>

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
