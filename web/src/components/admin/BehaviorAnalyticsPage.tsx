"use client";

import { useState } from "react";
import { BarChart } from "@/components/admin/charts/BarChart";
import { DistributionBars } from "@/components/admin/charts/DistributionBars";
import { FunnelChart } from "@/components/admin/charts/FunnelChart";
import {
  formatCount,
  formatEventTypeVi,
  FUNNEL_EVENT_TYPES,
} from "@/components/admin/charts/chart-utils";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useAdminAnalytics } from "@/hooks/useAdminAnalytics";
import { formatIsoDateVi } from "@/lib/format/date";
import type { AnalyticsSource, FunnelEventType } from "@/types/admin-analytics";

const RANGE_OPTIONS = [7, 30, 90];

const SOURCE_OPTIONS: { value: AnalyticsSource; label: string }[] = [
  { value: "real", label: "Thật" },
  { value: "simulator", label: "Mô phỏng" },
  { value: "all", label: "Tất cả" },
];

// Hành vi người dùng (plan 2026-09-29-15, T14, AC4-AC7, AC10) — read-only behavior analytics:
// events per day, the Xem → Mua funnel, top-10 products for one event type and the face-shape
// distribution, all for the last 7/30/90 days (Vietnam calendar days on the server side).
export function BehaviorAnalyticsPage() {
  const [days, setDays] = useState(30);
  const [source, setSource] = useState<AnalyticsSource>("real");
  const [eventType, setEventType] = useState<FunnelEventType>("VIEW");
  const { daily, funnel, topProducts, faceShapes, isLoading, error, refetch } = useAdminAnalytics({
    days,
    source,
    eventType,
  });
  const hasData = Boolean(daily && funnel && topProducts && faceShapes);

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">Hành vi người dùng</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        <div className="admin-toolbar admin-analytics__toolbar">
          <div className="admin-analytics__ranges" role="group" aria-label="Khoảng thời gian">
            {RANGE_OPTIONS.map((option) => (
              <button
                key={option}
                type="button"
                className={`btn btn--outline btn--small${option === days ? " btn--selected" : ""}`}
                aria-pressed={option === days}
                onClick={() => setDays(option)}
              >
                {option} ngày
              </button>
            ))}
          </div>

          <label htmlFor="admin-analytics-source" className="orders-page__filter admin-analytics__filter">
            Nguồn dữ liệu
            <select
              id="admin-analytics-source"
              value={source}
              onChange={(event) => setSource(event.target.value as AnalyticsSource)}
            >
              {SOURCE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label htmlFor="admin-analytics-event-type" className="orders-page__filter admin-analytics__filter">
            Loại event (Top 10 sản phẩm)
            <select
              id="admin-analytics-event-type"
              value={eventType}
              onChange={(event) => setEventType(event.target.value as FunnelEventType)}
            >
              {FUNNEL_EVENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {formatEventTypeVi(type)}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className="btn btn--outline btn--small admin-analytics__refresh"
            onClick={() => void refetch()}
          >
            Làm mới
          </button>
        </div>

        {/* First load: full loading state. Reloads keep the loaded sections (and the controls
            the admin just used) mounted and only show a small inline status. */}
        {isLoading && !hasData && <LoadingState label="Đang tải dữ liệu hành vi..." />}
        {!isLoading && error && <ErrorState message={error} />}

        {daily && funnel && topProducts && faceShapes && (
          <div className="admin-analytics__body" aria-busy={isLoading}>
            <p className="admin-analytics__range" aria-live="polite">
              Từ {formatIsoDateVi(daily.from)} đến {formatIsoDateVi(daily.to)}
              {isLoading && <span className="admin-analytics__reloading"> · Đang tải…</span>}
            </p>

            <div className="admin-analytics__section">
              <h2 className="admin-analytics__title">Số event theo ngày</h2>
              <BarChart days={daily.days} />
            </div>

            <div className="admin-analytics__section">
              <h2 className="admin-analytics__title">Phễu chuyển đổi</h2>
              <p className="admin-analytics__note">
                Mỗi bước là số người dùng khác nhau có ít nhất một event loại đó trong khoảng thời
                gian đã chọn. Các bước được đếm độc lập, không bắt buộc đi theo thứ tự, nên tỉ lệ có
                thể lớn hơn 100%.
              </p>
              <FunnelChart steps={funnel.steps} />
            </div>

            <div className="admin-analytics__section">
              <h2 className="admin-analytics__title">
                Top 10 sản phẩm · {formatEventTypeVi(topProducts.eventType)}
              </h2>

              <div className="admin-table">
                <div className="admin-table__row admin-table__row--top-products admin-table__row--head">
                  <span>#</span>
                  <span></span>
                  <span>Sản phẩm</span>
                  <span>Số event</span>
                </div>
                {topProducts.items.map((item, index) => {
                  const name = item.name ?? "Sản phẩm đã gỡ";
                  return (
                    <div
                      key={item.productId}
                      className="admin-table__row admin-table__row--top-products admin-table__row--body"
                    >
                      <span className="admin-table__tag">{index + 1}</span>
                      {item.thumbnailUrl ? (
                        <ImageWithFallback
                          src={item.thumbnailUrl}
                          alt={name}
                          className="admin-table__thumb"
                          placeholderClassName="admin-table__thumb"
                        />
                      ) : (
                        <div className="admin-table__thumb" role="img" aria-label={name} />
                      )}
                      <div>
                        <div className="admin-table__name">{name}</div>
                        {item.slug && <div className="admin-table__tag">{item.slug}</div>}
                      </div>
                      <span>{formatCount(item.count)}</span>
                    </div>
                  );
                })}
                {topProducts.items.length === 0 && (
                  <div className="admin-table__empty">Chưa có dữ liệu trong khoảng thời gian này.</div>
                )}
              </div>
            </div>

            <div className="admin-analytics__section">
              <h2 className="admin-analytics__title">Phân bố dáng mặt</h2>
              <p className="admin-analytics__note">
                Tính từ {formatCount(faceShapes.total)} lần phân tích khuôn mặt trong khoảng thời gian
                đã chọn. Bộ lọc nguồn dữ liệu không áp dụng cho biểu đồ này.
              </p>
              <DistributionBars items={faceShapes.items} total={faceShapes.total} />
            </div>
          </div>
        )}
      </section>
    </>
  );
}
