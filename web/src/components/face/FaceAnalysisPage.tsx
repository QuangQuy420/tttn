"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, getFaceAnalysisHistory } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useFaceAnalysis } from "@/hooks/useFaceAnalysis";
import { getAccessToken } from "@/lib/auth/session";
import { formatFaceShapeVi } from "@/lib/labels";
import type { FaceAnalysisResult, FaceMeasurements } from "@/types/face";

const MEASUREMENT_FIELDS: { key: keyof FaceMeasurements; label: string }[] = [
  { key: "face_length", label: "Chiều dài khuôn mặt" },
  { key: "forehead_width", label: "Chiều rộng trán" },
  { key: "cheekbone_width", label: "Chiều rộng gò má" },
  { key: "jaw_width", label: "Chiều rộng hàm" },
  { key: "length_to_width_ratio", label: "Tỉ lệ dài / gò má" },
  { key: "cheekbone_to_jaw_ratio", label: "Tỉ lệ gò má / hàm" },
  { key: "forehead_to_jaw_ratio", label: "Tỉ lệ trán / hàm" },
];

// Rough visual scale for the measurement bars only, not a calibrated metric — all 7 values are
// unitless (fractions of image dimensions, or ratios of those fractions) and land roughly in the
// 0-1.5 range in practice.
const MEASUREMENT_BAR_MAX = 1.5;

// Shared between the current result and each history item — both render the same 7-field
// measurement grid from a FaceMeasurements object.
function MeasurementsGrid({ measurements }: { measurements: FaceMeasurements }) {
  return (
    <div className="face-analysis__measurements-grid">
      {MEASUREMENT_FIELDS.map(({ key, label }) => {
        const value = measurements[key];
        const pct = Math.min(100, Math.round((value / MEASUREMENT_BAR_MAX) * 100));
        return (
          <div key={key}>
            <div className="face-analysis__measurement-row">
              <span className="face-analysis__measurement-label">{label}</span>
              <span className="face-analysis__measurement-value">{value.toFixed(3)}</span>
            </div>
            <div className="face-analysis__measurement-bar">
              <div className="face-analysis__measurement-bar-fill" style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Matches .design/Try Face Analysis.dc.html. Uploads a face photo (previewed locally while the
// request is in flight), then shows the shape/confidence + measurements on success.
// accept list mirrors ImageUploadSlot.tsx (image/jpeg,image/png,image/webp — NFR1).
export function FaceAnalysisPage() {
  const router = useRouter();
  const { result, isLoading, error, analyze } = useFaceAnalysis();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Gate: only a logged-in user may upload/analyze a photo (AC1). Checked on mount, same as
  // AdminGuard — the underlying gateway route also enforces this (401), this is just the UI gate.
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [history, setHistory] = useState<FaceAnalysisResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  useEffect(() => {
    async function verifyLoggedIn() {
      const token = getAccessToken();
      if (!token) {
        router.replace("/login");
        setIsAuthenticated(false);
        setAuthChecked(true);
        return;
      }
      setIsAuthenticated(true);
      setAuthChecked(true);
    }
    void verifyLoggedIn();
  }, [router]);

  // Fetch the current user's past analyses on mount (pattern like ProductEditForm.tsx's
  // categories/brands fetch) — shown right on this page, not on /profile (Q3).
  useEffect(() => {
    const token = getAccessToken();
    if (!token) return;

    let cancelled = false;
    async function loadHistory() {
      setHistoryLoading(true);
      setHistoryError(null);
      try {
        const items = await getFaceAnalysisHistory(token as string);
        if (!cancelled) setHistory(items);
      } catch (err) {
        if (!cancelled) {
          setHistoryError(err instanceof ApiError ? err.message : "Không thể tải lịch sử phân tích của bạn.");
        }
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    }
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, []);

  // Revoke the local object URL once it's no longer the active preview (either replaced by a
  // new selection, or the component unmounts) — otherwise each upload leaks a blob URL.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(file.name);
    await analyze(file);
  }

  const displayImageUrl = result?.imageUrl ?? previewUrl;
  const confidencePct = result ? Math.round(result.confidence * 100) : null;
  const isLowConfidence = confidencePct !== null && confidencePct < 70;

  // Not logged in — don't render the upload UI at all (AC1). We already redirect above; this
  // covers the render before the redirect takes effect and the (unreachable in practice, but
  // safe) case where redirect is blocked.
  if (authChecked && !isAuthenticated) {
    return (
      <section aria-labelledby="face-analysis-heading" className="face-analysis">
        <h1 id="face-analysis-heading" className="face-analysis__title">
          Phân tích khuôn mặt
        </h1>
        <p className="face-analysis__subtitle">
          Vui lòng <Link href="/login">đăng nhập</Link> để tải ảnh lên và xem kết quả phân tích
          dáng khuôn mặt của bạn.
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="face-analysis-heading" className="face-analysis">
      <p className="face-analysis__eyebrow">Công cụ phân tích</p>
      <h1 id="face-analysis-heading" className="face-analysis__title">
        Phân tích khuôn mặt
      </h1>
      <p className="face-analysis__subtitle">
        Tải lên 1 ảnh chân dung để tìm dáng khuôn mặt và các số đo liên quan — dùng làm cơ sở để
        gợi ý gọng kính phù hợp.
      </p>

      <div className="face-analysis__card">
        <p className="face-analysis__section-label">Chọn ảnh</p>
        <div className="face-analysis__upload-row">
          <label className="face-analysis__file-button">
            Chọn tệp
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isLoading}
              onChange={handleFileChange}
              aria-label="Tải lên ảnh khuôn mặt"
            />
          </label>
          <span className="face-analysis__file-name">{fileName ?? "Chưa chọn tệp nào"}</span>
        </div>
        <div className="face-analysis__preview-frame">
          <div className="face-analysis__preview-box">
            {displayImageUrl ? (
              <ImageWithFallback
                src={displayImageUrl}
                alt="Ảnh khuôn mặt đã tải lên"
                className="face-analysis__preview-image"
                placeholderClassName="face-analysis__preview-image face-analysis__preview-placeholder"
              />
            ) : (
              <p className="face-analysis__preview-placeholder">
                Kéo thả ảnh chân dung vào đây, hoặc bấm Chọn tệp
              </p>
            )}
          </div>
        </div>
        <p className="face-analysis__privacy-note">
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="M12 2l8 4v6c0 5-3.4 8.5-8 10-4.6-1.5-8-5-8-10V6l8-4z" />
          </svg>
          Ảnh của bạn được lưu trữ riêng tư và chỉ dùng để phân tích dáng khuôn mặt.
        </p>
      </div>

      {isLoading && <LoadingState label="Đang phân tích ảnh của bạn..." />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && result && (
        <>
          <div className="face-analysis__card face-analysis__result-card">
            <div className="face-analysis__result-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F7F3EC" strokeWidth="1.6">
                <ellipse cx="12" cy="12" rx="6.5" ry="9" />
              </svg>
            </div>
            <div className="face-analysis__result-shape">
              <p className="face-analysis__result-label">Dáng khuôn mặt</p>
              <p className="face-analysis__result-value">{formatFaceShapeVi(result.faceShape)}</p>
            </div>
            <div className="face-analysis__result-confidence">
              <p className="face-analysis__result-label">Độ tin cậy</p>
              <p
                className={`face-analysis__confidence-value ${
                  isLowConfidence
                    ? "face-analysis__confidence-value--low"
                    : "face-analysis__confidence-value--high"
                }`}
              >
                {confidencePct}%
              </p>
            </div>
          </div>

          {isLowConfidence && (
            <div className="face-analysis__hint">
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <path d="M12 9v4M12 17h.01" />
                <circle cx="12" cy="12" r="9" />
              </svg>
              <span>
                Độ tin cậy còn thấp — hãy thử 1 ảnh chụp thẳng, đủ sáng, không đội mũ hay đeo kính
                để có kết quả chính xác hơn.
              </span>
            </div>
          )}

          <div className="face-analysis__card">
            <p className="face-analysis__section-label">Số đo khuôn mặt</p>
            <MeasurementsGrid measurements={result.measurements} />
          </div>

          {/* recommendation-service doesn't exist yet (out of scope, plan Q2) — same
              disabled/"Coming soon" pattern as ProductDetailPage's Try AR / Add to cart. */}
          <button
            type="button"
            className="btn btn--primary"
            disabled
            title="Sắp ra mắt"
            aria-label="Xem gọng kính được gợi ý (sắp ra mắt)"
          >
            Xem gọng kính được gợi ý
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </>
      )}

      <div className="face-analysis__card">
        <p className="face-analysis__section-label">Lịch sử phân tích của bạn</p>
        {historyLoading && <LoadingState label="Đang tải lịch sử phân tích của bạn..." />}
        {!historyLoading && historyError && <ErrorState message={historyError} />}
        {!historyLoading && !historyError && history.length === 0 && (
          <p className="face-analysis__preview-placeholder">
            Bạn chưa phân tích ảnh nào.
          </p>
        )}
        {!historyLoading && !historyError && history.length > 0 && (
          <div className="face-analysis__history-list">
            {history.map((item) => (
              <div key={item.id} className="face-analysis__history-item">
                <div className="face-analysis__history-top">
                  <div className="face-analysis__history-thumb">
                    <ImageWithFallback
                      src={item.imageUrl}
                      alt="Ảnh khuôn mặt đã phân tích trước đó"
                      className="face-analysis__history-thumb-image"
                      placeholderClassName="face-analysis__history-thumb-image face-analysis__history-thumb-placeholder"
                    />
                  </div>
                  <div className="face-analysis__history-details">
                    <div>
                      <p className="face-analysis__result-label">Dáng khuôn mặt</p>
                      <p className="face-analysis__history-value">{formatFaceShapeVi(item.faceShape)}</p>
                    </div>
                    <div>
                      <p className="face-analysis__result-label">Độ tin cậy</p>
                      <p className="face-analysis__history-value">{Math.round(item.confidence * 100)}%</p>
                    </div>
                  </div>
                </div>
                <MeasurementsGrid measurements={item.measurements} />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
