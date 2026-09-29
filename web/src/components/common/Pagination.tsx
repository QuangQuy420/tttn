interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

// First, last, and the current page ±1 — gaps between them collapse into "…".
function buildPageItems(page: number, totalPages: number): (number | "ellipsis")[] {
  const pages = new Set([1, totalPages, page - 1, page, page + 1]);
  const sorted = Array.from(pages)
    .filter((value) => value >= 1 && value <= totalPages)
    .sort((a, b) => a - b);

  const items: (number | "ellipsis")[] = [];
  sorted.forEach((value, index) => {
    if (index > 0 && value - sorted[index - 1] > 1) items.push("ellipsis");
    items.push(value);
  });
  return items;
}

// Shared page switcher (Trước / 1 2 3 … / Sau) for every paginated list. Renders nothing when
// there is only one page. `page` is 1-based, matching the API's `meta.page`.
export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) return null;

  return (
    <nav className="pagination" aria-label="Phân trang">
      <button
        type="button"
        className="pagination__button"
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
      >
        Trước
      </button>
      {buildPageItems(page, totalPages).map((item, index) =>
        item === "ellipsis" ? (
          <span key={`ellipsis-${index}`} className="pagination__ellipsis" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pagination__button${item === page ? " pagination__button--active" : ""}`}
            onClick={() => onPageChange(item)}
            aria-current={item === page ? "page" : undefined}
            aria-label={`Trang ${item}`}
          >
            {item}
          </button>
        ),
      )}
      <button
        type="button"
        className="pagination__button"
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
      >
        Sau
      </button>
    </nav>
  );
}
