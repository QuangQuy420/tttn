"use client";

import { useEffect, useState } from "react";
import { ApiError, getFaceShapeModelInfo, getPreferenceModelInfo } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { formatMetric } from "@/components/admin/charts/chart-utils";
import { getAccessToken } from "@/lib/auth/session";
import type {
  FaceShapeModelInfo,
  PreferenceModelInfo,
  PreferenceNorm,
} from "@/types/admin-analytics";

const PREFERENCE_NORM_LABELS_VI: Record<PreferenceNorm, string> = {
  rank: "Theo thứ hạng (rank)",
  none: "Không chuẩn hoá (none)",
};

interface ModelInfoState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

// Loads one model-info endpoint on its own, so a failing service only breaks its own card.
function useModelInfo<T>(
  fetcher: (token: string) => Promise<T>,
  fallbackError: string,
): ModelInfoState<T> {
  const [data, setData] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setError("Vui lòng đăng nhập lại.");
          setIsLoading(false);
        }
        return;
      }

      setIsLoading(true);
      setError(null);
      try {
        const result = await fetcher(token);
        if (!cancelled) setData(result);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof ApiError ? err.message : fallbackError);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void run();

    return () => {
      cancelled = true;
    };
  }, [fetcher, fallbackError]);

  return { data, isLoading, error };
}

// Model card timestamps are ISO datetimes ("2026-10-05T04:01:08+00:00") — shown in Vietnam time.
function formatDateTimeVi(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });
}

// Configured ranking weight (0.6 → "0,6"), same vi-VN number style as the metrics.
function formatWeightVi(value: number): string {
  return value.toLocaleString("vi-VN", { maximumFractionDigits: 3 });
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="admin-stat-card">
      <div className="admin-stat-card__label">{label}</div>
      <div className="admin-stat-card__value">{value}</div>
    </div>
  );
}

function FaceShapeModelCard({ info }: { info: FaceShapeModelInfo }) {
  if (info.method === "rule") {
    return (
      <>
        <p className="admin-model-card__status">
          <span className="admin-status-badge">Đang dùng rule-based</span>
        </p>
        <div className="admin-stats">
          <StatTile label="Phiên bản" value={info.modelVersion} />
          <StatTile label="Phương pháp" value="Rule-based" />
        </div>
        <p className="admin-model-card__note">
          Dáng mặt được xác định bằng luật từ tỉ lệ khuôn mặt, nên không có chỉ số đánh giá.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="admin-model-card__status">
        <span className="admin-status-badge admin-status-badge--active">Đang dùng model ML</span>
      </p>
      <div className="admin-stats">
        <StatTile label="Phiên bản" value={info.modelVersion} />
        <StatTile label="Thuật toán" value={info.algorithm ?? "—"} />
        <StatTile label="Accuracy" value={formatMetric(info.metrics?.accuracy)} />
        <StatTile label="Macro-F1" value={formatMetric(info.metrics?.macroF1)} />
      </div>
      <p className="admin-model-card__note">Huấn luyện lúc: {formatDateTimeVi(info.createdAt)}</p>
    </>
  );
}

function PreferenceModelCard({ info }: { info: PreferenceModelInfo }) {
  const weights = (
    <div className="admin-stats">
      <StatTile label="Hệ số α" value={formatWeightVi(info.alpha)} />
      <StatTile label="Hệ số β" value={formatWeightVi(info.beta)} />
      <StatTile
        label="Chuẩn hoá PreferenceScore"
        value={PREFERENCE_NORM_LABELS_VI[info.preferenceNorm] ?? info.preferenceNorm}
      />
    </div>
  );

  if (!info.loaded) {
    return (
      <>
        <p className="admin-model-card__status">
          <span className="admin-status-badge">Chưa có model</span>
        </p>
        {weights}
        <p className="admin-model-card__note">
          Chưa nạp model PreferenceScore nên α hiệu dụng = 0: gợi ý chỉ dựa trên điểm hợp dáng mặt.
        </p>
      </>
    );
  }

  return (
    <>
      <p className="admin-model-card__status">
        <span className="admin-status-badge admin-status-badge--active">Đang dùng model</span>
      </p>
      <div className="admin-stats">
        <StatTile label="Phiên bản" value={info.version ?? "—"} />
        <StatTile label="Thuật toán" value={info.algorithm ?? "—"} />
        <StatTile label="NDCG@10" value={formatMetric(info.metrics?.ndcgAt10)} />
        <StatTile label="HitRate@10" value={formatMetric(info.metrics?.hitRateAt10)} />
      </div>
      {weights}
      <p className="admin-model-card__note">
        Mục tiêu huấn luyện: {info.objective ?? "—"} · Huấn luyện lúc: {formatDateTimeVi(info.createdAt)}
      </p>
    </>
  );
}

// Model AI (plan 2026-09-29-15, T13, AC1-AC3) — read-only view of the two AI models currently
// served: the face-shape classifier (face-processing-service) and the PreferenceScore ranker
// (recommendation-service). Each card loads independently.
export function AiModelsPage() {
  const faceModel = useModelInfo(getFaceShapeModelInfo, "Không thể tải thông tin model dáng mặt.");
  const preferenceModel = useModelInfo(
    getPreferenceModelInfo,
    "Không thể tải thông tin model gợi ý.",
  );

  return (
    <>
      <header className="admin-header">
        <div className="admin-header__title">Model AI</div>
        <div className="admin-header__avatar">AD</div>
      </header>

      <section className="admin-content">
        <div className="admin-model-card">
          <h2 className="admin-model-card__title">Nhận diện dáng mặt</h2>
          {faceModel.isLoading && <LoadingState label="Đang tải thông tin model..." />}
          {!faceModel.isLoading && faceModel.error && <ErrorState message={faceModel.error} />}
          {!faceModel.isLoading && !faceModel.error && faceModel.data && (
            <FaceShapeModelCard info={faceModel.data} />
          )}
        </div>

        <div className="admin-model-card">
          <h2 className="admin-model-card__title">Gợi ý sản phẩm (PreferenceScore)</h2>
          {preferenceModel.isLoading && <LoadingState label="Đang tải thông tin model..." />}
          {!preferenceModel.isLoading && preferenceModel.error && (
            <ErrorState message={preferenceModel.error} />
          )}
          {!preferenceModel.isLoading && !preferenceModel.error && preferenceModel.data && (
            <PreferenceModelCard info={preferenceModel.data} />
          )}
        </div>
      </section>
    </>
  );
}
