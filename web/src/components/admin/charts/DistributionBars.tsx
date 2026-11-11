import type { FaceShapeCount } from "@/types/admin-analytics";
import { formatFaceShapeVi } from "@/lib/labels";
import { formatCount, formatPercent, shareOf } from "./chart-utils";

interface DistributionBarsProps {
  items: FaceShapeCount[];
  total: number;
}

// Phân bố dáng mặt (plan 2026-09-29-15, T12, AC7) — the 6 face shapes in the order the API
// returns them, each with its count and share of all analyses in the range. Bar widths are
// relative to the largest shape so small differences stay visible.
export function DistributionBars({ items, total }: DistributionBarsProps) {
  const maxCount = items.reduce((max, item) => Math.max(max, item.count), 0);
  if (items.length === 0 || total === 0 || maxCount === 0) {
    return <div className="admin-table__empty">Chưa có dữ liệu trong khoảng thời gian này.</div>;
  }

  return (
    <div className="admin-chart">
      <ul className="admin-chart__rows" aria-label="Phân bố dáng mặt từ các lần phân tích khuôn mặt">
        {items.map((item) => {
          const label = formatFaceShapeVi(item.faceShape);
          const share = formatPercent(shareOf(item.count, total));
          return (
            <li
              key={item.faceShape}
              className="admin-chart__row"
              title={`${label}: ${formatCount(item.count)} lần (${share})`}
            >
              <span className="admin-chart__row-label">{label}</span>
              <span className="admin-chart__track">
                <span
                  className="admin-chart__fill"
                  style={{ width: `${shareOf(item.count, maxCount) * 100}%` }}
                />
              </span>
              <span className="admin-chart__row-value">
                <span className="admin-chart__row-count">{formatCount(item.count)}</span>
                <span className="admin-chart__row-note">{share}</span>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
