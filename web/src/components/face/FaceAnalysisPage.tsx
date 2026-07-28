"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError, deleteFaceAnalysisHistory, getFaceAnalysisHistory } from "@/lib/api";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useFaceAnalysis } from "@/hooks/useFaceAnalysis";
import { useStaticFaceOverlay } from "@/hooks/useStaticFaceOverlay";
import { getAccessToken } from "@/lib/auth/session";
import { formatFaceShapeVi } from "@/lib/labels";
import { FaceCameraCapture } from "./FaceCameraCapture";
import { RecommendationPreview } from "./RecommendationPreview";
import type { FaceAnalysisResult, FaceMeasurements } from "@/types/face";
import type { RecommendedProduct } from "@/types/recommendation";

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

// Vietnamese hints for the static-photo try-on overlay's non-"ready" statuses, mirroring
// TryOnPage.tsx's STATUS_HINTS pattern for the live-camera case (FR3/AC4).
const TRY_ON_STATUS_HINTS: Partial<Record<string, string>> = {
  "loading-model": "Đang tải mô hình nhận diện khuôn mặt...",
  detecting: "Đang nhận diện khuôn mặt trong ảnh...",
};

// Fixed Vietnamese label shown next to "Chọn tệp" for a camera-sourced photo — never a generated
// filename, since that would be user-facing English text (AC12).
const CAMERA_CAPTURE_FILE_LABEL = "Ảnh chụp từ camera";

// Matches .design/Try Face Analysis.dc.html. Uploads a face photo (previewed locally while the
// request is in flight), then shows the shape/confidence + measurements on success.
// accept list mirrors ImageUploadSlot.tsx (image/jpeg,image/png,image/webp — NFR1).
export function FaceAnalysisPage() {
  const router = useRouter();
  const { result, isLoading, error, analyze } = useFaceAnalysis();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  // Which of the two "Chọn ảnh" entry points is active — "camera" swaps the preview box for the
  // live camera capture flow and hides the file input so the two can't be triggered at once (T3).
  const [photoSource, setPhotoSource] = useState<"idle" | "camera">("idle");

  // Gate: only a logged-in user may upload/analyze a photo (AC1). Checked on mount, same as
  // AdminGuard — the underlying gateway route also enforces this (401), this is just the UI gate.
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  const [history, setHistory] = useState<FaceAnalysisResult[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Separate from `historyError` on purpose: `historyError` gates whether the whole history
  // list renders at all (see the JSX below), so a failed delete must not reuse it — that would
  // hide every other item's "Xóa"/"Xem lại" button behind one error message.
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // A clicked history item becomes the page's single active result (FR5) — takes precedence
  // over `result` until either another history item is clicked or a fresh upload succeeds (AC6).
  const [selectedHistoryItem, setSelectedHistoryItem] = useState<FaceAnalysisResult | null>(null);

  // A fresh analyze() success must take back over as the active result (AC6). Adjusted during
  // render (not a useEffect — react-hooks/set-state-in-effect) by tracking the previous `result`
  // in state (not a ref — react-hooks/refs forbids reading/writing a ref during render, same
  // reasoning TryOnPage.tsx's `hasShownCamera` comment documents), so it clears in the same
  // render `result` changes in, with no extra render pass.
  const [previousResult, setPreviousResult] = useState(result);
  if (result !== previousResult) {
    setPreviousResult(result);
    if (result) setSelectedHistoryItem(null);
  }

  const activeResult = selectedHistoryItem ?? result;

  // Static-photo try-on (FR1/FR2): which recommended frame (if any) is being tried on the active
  // photo. Reset whenever the active photo itself changes, so switching photos never leaves a
  // stale overlay drawn from the previous photo's landmarks (T6). Same render-time-adjustment
  // pattern as above.
  const [selectedFrame, setSelectedFrame] = useState<RecommendedProduct | null>(null);
  const [previousActiveResult, setPreviousActiveResult] = useState(activeResult);
  if (activeResult !== previousActiveResult) {
    setPreviousActiveResult(activeResult);
    if (selectedFrame) setSelectedFrame(null);
  }

  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayThumbnail = selectedFrame
    ? selectedFrame.images.find((image) => image.isThumbnail) ?? selectedFrame.images[0]
    : null;
  const { status: overlayStatus, errorMessage: overlayErrorMessage } = useStaticFaceOverlay({
    photoUrl: selectedFrame ? (activeResult?.imageUrl ?? null) : null,
    overlayImageUrl: overlayThumbnail?.imageUrl ?? null,
    canvasRef: overlayCanvasRef,
  });

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

  // Mirrors handleFileChange's pipeline, but the label is a fixed Vietnamese string rather than
  // `file.name` — a generated camera-capture filename would be user-facing English text (AC12).
  // photoSource flips back to "idle" right away (same moment previewUrl swaps in) so the preview
  // box immediately shows the captured photo the normal way, same as a file upload does (T3).
  async function handleCameraConfirm(file: File) {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(URL.createObjectURL(file));
    setFileName(CAMERA_CAPTURE_FILE_LABEL);
    setPhotoSource("idle");
    await analyze(file);
  }

  function handleCameraCancel() {
    setPhotoSource("idle");
  }

  // Deletes one history item (AC1). Confirms first, then removes it from `history` on success and
  // clears `selectedHistoryItem` if that item was the one being previewed (AC6).
  async function handleDeleteHistoryItem(id: string) {
    if (!window.confirm("Xóa kết quả phân tích này? Hành động này không thể hoàn tác.")) return;

    const token = getAccessToken();
    if (!token) return;

    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteFaceAnalysisHistory(id, token);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      setSelectedHistoryItem((prev) => (prev?.id === id ? null : prev));
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : "Không thể xóa kết quả phân tích này.");
    } finally {
      setDeletingId(null);
    }
  }

  // Derive from `activeResult` (not just `result`) so a selected history item's photo also shows
  // here, not only a fresh upload's (plan T6 note).
  const displayImageUrl = activeResult?.imageUrl ?? previewUrl;
  const confidencePct = activeResult ? Math.round(activeResult.confidence * 100) : null;
  const isLowConfidence = confidencePct !== null && confidencePct < 70;

  // Whether the top photo+recommendations row is showing — mirrors the condition that row is
  // gated on below. When true, the "Chọn ảnh" card moves into that row's left column (instead of
  // rendering full-width above everything) so the recommendations column sits beside the photo
  // itself, not below the shape/confidence/measurements info (which renders full-width below).
  const showResultLayout = !isLoading && !error && Boolean(activeResult);

  // Matches the recommend column's card height to the photo column's rendered height, so their
  // bottom edges line up — a plain CSS grid row can't do this on its own (an "auto" row sizes to
  // each column's max-content regardless of overflow/min-height tricks on the taller column, so
  // it never actually shrinks the recommend column to match a shorter photo column; verified by
  // measuring the real rendered boxes rather than assuming the CSS trick worked). Only applied at
  // the >900px breakpoint where the two columns actually share a row (see globals.css) — below
  // that they stack, so the list should just grow naturally instead of being height-capped.
  const photoColumnRef = useRef<HTMLDivElement>(null);
  const recommendCardRef = useRef<HTMLDivElement>(null);
  const [recommendMaxHeight, setRecommendMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    const photoColumn = photoColumnRef.current;
    if (!photoColumn) return;

    const mediaQuery = window.matchMedia("(min-width: 901px)");

    function updateHeight() {
      // Non-null: this closure is only ever created/called after the `!photoColumn` early
      // return above, and `photoColumn` is a const, so it can't become null afterward.
      setRecommendMaxHeight(mediaQuery.matches ? photoColumn!.getBoundingClientRect().height : null);
    }

    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(photoColumn);
    mediaQuery.addEventListener("change", updateHeight);
    updateHeight();

    return () => {
      resizeObserver.disconnect();
      mediaQuery.removeEventListener("change", updateHeight);
    };
  }, [showResultLayout]);

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

  // Extracted so it can render either full-width above the results (no result yet, loading, or
  // error) or as the first item in the left column once the two-column result layout is showing
  // (showResultLayout) — the recommendations column must sit beside this card, not beside the
  // measurements list below it.
  const uploadCard = (
    <div className="face-analysis__card">
      <p className="face-analysis__section-label">Chọn ảnh</p>
      <div className="face-analysis__upload-row">
        <label className="face-analysis__file-button">
          Chọn tệp
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={isLoading || photoSource === "camera"}
            onChange={handleFileChange}
            aria-label="Tải lên ảnh khuôn mặt"
          />
        </label>
        <button
          type="button"
          className="face-analysis__camera-button"
          disabled={isLoading || photoSource === "camera"}
          onClick={() => setPhotoSource("camera")}
        >
          Chụp ảnh
        </button>
        <span className="face-analysis__file-name">{fileName ?? "Chưa chọn tệp nào"}</span>
      </div>
      <div className="face-analysis__preview-frame">
        {photoSource === "camera" ? (
          <FaceCameraCapture onConfirm={handleCameraConfirm} onCancel={handleCameraCancel} />
        ) : (
          <div className="face-analysis__preview-box">
            {selectedFrame ? (
              <canvas ref={overlayCanvasRef} className="face-analysis__preview-image" />
            ) : displayImageUrl ? (
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
        )}
      </div>
      {selectedFrame && (
        <div className="face-analysis__tryon-bar">
          {overlayStatus !== "ready" && (
            <p role="status" className="face-analysis__tryon-hint">
              {overlayStatus === "no-face" || overlayStatus === "multiple-faces" || overlayStatus === "error"
                ? overlayErrorMessage
                : TRY_ON_STATUS_HINTS[overlayStatus]}
            </p>
          )}
          <button
            type="button"
            className="btn btn--outline btn--small"
            onClick={() => setSelectedFrame(null)}
          >
            Xem ảnh gốc
          </button>
        </div>
      )}
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
  );

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

      {!showResultLayout && uploadCard}

      {isLoading && <LoadingState label="Đang phân tích ảnh của bạn..." />}
      {!isLoading && error && <ErrorState message={error} />}

      {!isLoading && !error && activeResult && (
        <>
          {/* Top: photo + recommendations side by side, so trying on a suggestion needs no
              scrolling. Shape/confidence + measurements move below, full-width, since they're
              read-once info rather than something to click while looking at the photo. */}
          <div className="face-analysis__result-layout">
            <div className="face-analysis__result-column" ref={photoColumnRef}>
              {uploadCard}
            </div>

            <div className="face-analysis__recommend-column">
              <div
                className="face-analysis__card"
                ref={recommendCardRef}
                style={{ maxHeight: recommendMaxHeight ?? undefined }}
              >
                <p className="face-analysis__section-label">Gọng kính gợi ý cho bạn</p>
                <RecommendationPreview faceShape={activeResult.faceShape} onTryOnPhoto={setSelectedFrame} />
              </div>
            </div>
          </div>

          <div className="face-analysis__card face-analysis__result-card">
            <div className="face-analysis__result-icon" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#F7F3EC" strokeWidth="1.6">
                <ellipse cx="12" cy="12" rx="6.5" ry="9" />
              </svg>
            </div>
            <div className="face-analysis__result-shape">
              <p className="face-analysis__result-label">Dáng khuôn mặt</p>
              <p className="face-analysis__result-value">{formatFaceShapeVi(activeResult.faceShape)}</p>
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
            <MeasurementsGrid measurements={activeResult.measurements} />
          </div>
        </>
      )}

      <div className="face-analysis__card">
        <p className="face-analysis__section-label">Lịch sử phân tích của bạn</p>
        {historyLoading && <LoadingState label="Đang tải lịch sử phân tích của bạn..." />}
        {!historyLoading && historyError && <ErrorState message={historyError} />}
        {!historyLoading && !historyError && deleteError && <ErrorState message={deleteError} />}
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
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    onClick={() => setSelectedHistoryItem(item)}
                  >
                    Xem lại
                  </button>
                  <button
                    type="button"
                    className="btn btn--outline btn--small"
                    onClick={() => handleDeleteHistoryItem(item.id)}
                    disabled={deletingId === item.id}
                  >
                    {deletingId === item.id ? "Đang xóa..." : "Xóa"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
