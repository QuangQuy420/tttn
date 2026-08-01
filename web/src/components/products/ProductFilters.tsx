import { formatFrameShapeVi } from "@/lib/labels";
import type { Category } from "@/types/category";
import type { FrameShape } from "@/types/product";

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
  categories: Category[];
  frameShapes: FrameShape[];
  categoryId: string | undefined;
  frameShape: FrameShape | undefined;
  minPrice: number | undefined;
  maxPrice: number | undefined;
  onCategoryChange: (categoryId: string | undefined) => void;
  onFrameShapeChange: (frameShape: FrameShape | undefined) => void;
  onPriceRangeChange: (range: { minPrice: number | undefined; maxPrice: number | undefined }) => void;
}

export function ProductFilters({
  categories,
  frameShapes,
  categoryId,
  frameShape,
  minPrice,
  maxPrice,
  onCategoryChange,
  onFrameShapeChange,
  onPriceRangeChange,
}: ProductFiltersProps) {
  return (
    <div className="product-filters" aria-label="Lọc sản phẩm">
      <span className="product-filters__label">Lọc theo:</span>

      <div className="filter-pills" role="group" aria-label="Danh mục">
        <button
          type="button"
          className={`pill${categoryId === undefined ? " pill--active" : ""}`}
          onClick={() => onCategoryChange(undefined)}
        >
          Tất cả danh mục
        </button>
        {categories.map((category) => (
          <button
            key={category.id}
            type="button"
            className={`pill${categoryId === category.id ? " pill--active" : ""}`}
            onClick={() => onCategoryChange(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="filter-pills" role="group" aria-label="Kiểu gọng kính">
        <button
          type="button"
          className={`pill${frameShape === undefined ? " pill--active" : ""}`}
          onClick={() => onFrameShapeChange(undefined)}
        >
          Tất cả kiểu gọng
        </button>
        {frameShapes.map((shape) => (
          <button
            key={shape}
            type="button"
            className={`pill${frameShape === shape ? " pill--active" : ""}`}
            onClick={() => onFrameShapeChange(shape)}
          >
            {formatFrameShapeVi(shape)}
          </button>
        ))}
      </div>

      <div className="filter-pills" role="group" aria-label="Khoảng giá">
        <button
          type="button"
          className={`pill${minPrice === undefined && maxPrice === undefined ? " pill--active" : ""}`}
          onClick={() => onPriceRangeChange({ minPrice: undefined, maxPrice: undefined })}
        >
          Tất cả mức giá
        </button>
        {PRICE_RANGES.map((range) => (
          <button
            key={range.label}
            type="button"
            className={`pill${isActivePriceRange(range, minPrice, maxPrice) ? " pill--active" : ""}`}
            onClick={() => onPriceRangeChange({ minPrice: range.minPrice, maxPrice: range.maxPrice })}
          >
            {range.label}
          </button>
        ))}
      </div>
    </div>
  );
}
