import type { FunnelStep } from "@/types/admin-analytics";
import { formatCount, formatEventTypeVi, formatPercent, shareOf } from "./chart-utils";

interface FunnelChartProps {
  steps: FunnelStep[];
}

// Phễu Xem → Thử kính → Thích → Thêm giỏ → Mua (plan 2026-09-29-15, T12, AC5) — one horizontal
// bar per step, width relative to the largest step, with the user count and the ratio to the
// previous step ("—" when the API returns null: first step, or previous step had 0 users).
export function FunnelChart({ steps }: FunnelChartProps) {
  const maxUsers = steps.reduce((max, step) => Math.max(max, step.users), 0);
  if (steps.length === 0 || maxUsers === 0) {
    return <div className="admin-table__empty">Chưa có dữ liệu trong khoảng thời gian này.</div>;
  }

  return (
    <div className="admin-chart">
      <ol className="admin-chart__rows" aria-label="Phễu chuyển đổi theo số người dùng">
        {steps.map((step) => {
          const label = formatEventTypeVi(step.eventType);
          const conversion = formatPercent(step.conversionFromPrevious);
          return (
            <li
              key={step.eventType}
              className="admin-chart__row"
              title={`${label}: ${formatCount(step.users)} người dùng · ${conversion} so với bước trước`}
            >
              <span className="admin-chart__row-label">{label}</span>
              <span className="admin-chart__track">
                <span
                  className="admin-chart__fill"
                  style={{ width: `${shareOf(step.users, maxUsers) * 100}%` }}
                />
              </span>
              <span className="admin-chart__row-value">
                <span className="admin-chart__row-count">{formatCount(step.users)}</span>
                <span className="admin-chart__row-note">{conversion} so với bước trước</span>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
