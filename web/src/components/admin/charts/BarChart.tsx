import type { DailyEventCount } from "@/types/admin-analytics";
import { formatIsoDateVi } from "@/lib/format/date";
import {
  dayTotal,
  eventTypeColorVar,
  formatCount,
  formatEventTypeVi,
  formatShortDateVi,
  FUNNEL_EVENT_TYPES,
  maxDayTotal,
  niceTicks,
  seriesTotals,
  stackSegments,
} from "./chart-utils";

interface BarChartProps {
  days: DailyEventCount[];
}

// Drawing space in viewBox units; the SVG scales to its container width (see .admin-chart__svg).
const WIDTH = 720;
const HEIGHT = 260;
const MARGIN = { top: 12, right: 8, bottom: 28, left: 44 };
const PLOT_WIDTH = WIDTH - MARGIN.left - MARGIN.right;
const PLOT_HEIGHT = HEIGHT - MARGIN.top - MARGIN.bottom;
const MAX_X_LABELS = 8;
const MAX_BAR_WIDTH = 48;
// Segments shorter than this skip the separating stroke so they don't vanish under it.
const MIN_STROKED_SEGMENT_HEIGHT = 2;

// Số event mỗi ngày (plan 2026-09-29-15, T12, AC4) — one stacked bar per day, the 5 funnel event
// types stacked bottom → top in funnel order with a fixed color each. Hovering a day shows its
// per-type counts via the native <title> tooltip; the legend repeats the range total per type
// so the numbers are readable without relying on color alone.
export function BarChart({ days }: BarChartProps) {
  const maxTotal = maxDayTotal(days);
  if (days.length === 0 || maxTotal === 0) {
    return <div className="admin-table__empty">Chưa có dữ liệu trong khoảng thời gian này.</div>;
  }

  const ticks = niceTicks(maxTotal);
  const axisTop = ticks[ticks.length - 1];
  const slotWidth = PLOT_WIDTH / days.length;
  const barWidth = Math.max(1, Math.min(slotWidth * 0.72, MAX_BAR_WIDTH));
  const labelEvery = Math.ceil(days.length / MAX_X_LABELS);
  const totals = seriesTotals(days);
  const grandTotal = FUNNEL_EVENT_TYPES.reduce((sum, type) => sum + totals[type], 0);

  const yOf = (value: number) => MARGIN.top + PLOT_HEIGHT - (value / axisTop) * PLOT_HEIGHT;
  const firstDay = days[0].date;
  const lastDay = days[days.length - 1].date;

  return (
    <div className="admin-chart">
      <ul className="admin-chart__legend">
        {FUNNEL_EVENT_TYPES.map((type) => (
          <li key={type} className="admin-chart__legend-item">
            <span className="admin-chart__swatch" style={{ background: eventTypeColorVar(type) }} />
            {formatEventTypeVi(type)}
            <span className="admin-chart__legend-value">{formatCount(totals[type])}</span>
          </li>
        ))}
      </ul>

      <div className="admin-chart__scroll">
        <svg
          className="admin-chart__svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          role="img"
          aria-label={`Biểu đồ số event theo ngày từ ${formatIsoDateVi(firstDay)} đến ${formatIsoDateVi(
            lastDay,
          )}, tổng ${formatCount(grandTotal)} event`}
        >
          {ticks.map((tick) => (
            <g key={tick}>
              <line
                className="admin-chart__grid"
                x1={MARGIN.left}
                x2={WIDTH - MARGIN.right}
                y1={yOf(tick)}
                y2={yOf(tick)}
              />
              <text className="admin-chart__axis-label" x={MARGIN.left - 6} y={yOf(tick)} textAnchor="end" dominantBaseline="middle">
                {formatCount(tick)}
              </text>
            </g>
          ))}

          {days.map((day, index) => {
            const slotX = MARGIN.left + index * slotWidth;
            const barX = slotX + (slotWidth - barWidth) / 2;
            const tooltip = [
              formatIsoDateVi(day.date),
              ...FUNNEL_EVENT_TYPES.map(
                (type) => `${formatEventTypeVi(type)}: ${formatCount(day.counts[type] ?? 0)}`,
              ),
              `Tổng: ${formatCount(dayTotal(day))}`,
            ].join("\n");

            return (
              <g key={day.date}>
                {/* Full-height hit area behind the bar so thin/short bars are still easy to hover. */}
                <rect
                  className="admin-chart__hit"
                  x={slotX}
                  y={MARGIN.top}
                  width={slotWidth}
                  height={PLOT_HEIGHT}
                >
                  <title>{tooltip}</title>
                </rect>
                {stackSegments(day).map((segment) => {
                  const y = yOf(segment.start + segment.value);
                  const height = yOf(segment.start) - y;
                  return (
                    <rect
                      key={segment.eventType}
                      className={`admin-chart__segment${
                        height < MIN_STROKED_SEGMENT_HEIGHT ? " admin-chart__segment--thin" : ""
                      }`}
                      x={barX}
                      y={y}
                      width={barWidth}
                      height={height}
                      fill={eventTypeColorVar(segment.eventType)}
                    />
                  );
                })}
                {index % labelEvery === 0 && (
                  <text
                    className="admin-chart__axis-label"
                    x={slotX + slotWidth / 2}
                    y={HEIGHT - MARGIN.bottom + 16}
                    textAnchor="middle"
                  >
                    {formatShortDateVi(day.date)}
                  </text>
                )}
              </g>
            );
          })}

          <line
            className="admin-chart__baseline"
            x1={MARGIN.left}
            x2={WIDTH - MARGIN.right}
            y1={yOf(0)}
            y2={yOf(0)}
          />
        </svg>
      </div>
    </div>
  );
}
