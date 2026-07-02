import type { Category } from "@/types/category";
import type { FrameShape } from "@/types/product";

const FRAME_SHAPES: FrameShape[] = [
  "ROUND",
  "SQUARE",
  "OVAL",
  "CAT_EYE",
  "AVIATOR",
  "RECTANGLE",
  "WAYFARER",
  "RIMLESS",
];

interface ProductFiltersProps {
  categories: Category[];
  categoryId: string | undefined;
  frameShape: FrameShape | undefined;
  onCategoryChange: (categoryId: string | undefined) => void;
  onFrameShapeChange: (frameShape: FrameShape | undefined) => void;
}

export function ProductFilters({
  categories,
  categoryId,
  frameShape,
  onCategoryChange,
  onFrameShapeChange,
}: ProductFiltersProps) {
  return (
    <form className="product-filters" aria-label="Filter products">
      <label htmlFor="filter-category">
        Category
        <select
          id="filter-category"
          value={categoryId ?? ""}
          onChange={(event) => onCategoryChange(event.target.value || undefined)}
        >
          <option value="">All categories</option>
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </label>

      <label htmlFor="filter-frame-shape">
        Frame shape
        <select
          id="filter-frame-shape"
          value={frameShape ?? ""}
          onChange={(event) =>
            onFrameShapeChange((event.target.value || undefined) as FrameShape | undefined)
          }
        >
          <option value="">All shapes</option>
          {FRAME_SHAPES.map((shape) => (
            <option key={shape} value={shape}>
              {shape}
            </option>
          ))}
        </select>
      </label>
    </form>
  );
}
