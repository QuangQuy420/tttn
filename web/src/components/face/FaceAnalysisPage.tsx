"use client";

import { useEffect, useState } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { ImageWithFallback } from "@/components/common/ImageWithFallback";
import { LoadingState } from "@/components/common/LoadingState";
import { useFaceAnalysis } from "@/hooks/useFaceAnalysis";
import { formatFaceShape } from "@/lib/format/price";
import type { FaceMeasurements } from "@/types/face";

const MEASUREMENT_FIELDS: { key: keyof FaceMeasurements; label: string }[] = [
  { key: "face_length", label: "Face length" },
  { key: "forehead_width", label: "Forehead width" },
  { key: "cheekbone_width", label: "Cheekbone width" },
  { key: "jaw_width", label: "Jaw width" },
  { key: "length_to_width_ratio", label: "Length / cheekbone ratio" },
  { key: "cheekbone_to_jaw_ratio", label: "Cheekbone / jaw ratio" },
  { key: "forehead_to_jaw_ratio", label: "Forehead / jaw ratio" },
];

// Rough visual scale for the measurement bars only, not a calibrated metric — all 7 values are
// unitless (fractions of image dimensions, or ratios of those fractions) and land roughly in the
// 0-1.5 range in practice.
const MEASUREMENT_BAR_MAX = 1.5;

// Matches .design/Try Face Analysis.dc.html. Uploads a face photo (previewed locally while the
// request is in flight), then shows the shape/confidence + measurements on success.
// accept list mirrors ImageUploadSlot.tsx (image/jpeg,image/png,image/webp — NFR1).
export function FaceAnalysisPage() {
  const { result, isLoading, error, analyze } = useFaceAnalysis();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

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

  return (
    <section aria-labelledby="face-analysis-heading" className="face-analysis">
      <p className="face-analysis__eyebrow">Analysis tool</p>
      <h1 id="face-analysis-heading" className="face-analysis__title">
        Face Analysis
      </h1>
      <p className="face-analysis__subtitle">
        Upload a portrait photo to find your face shape and the measurements behind it — used as
        the basis for frame recommendations.
      </p>

      <div className="face-analysis__card">
        <p className="face-analysis__section-label">Choose a photo</p>
        <div className="face-analysis__upload-row">
          <label className="face-analysis__file-button">
            Choose file
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              disabled={isLoading}
              onChange={handleFileChange}
              aria-label="Upload a face photo"
            />
          </label>
          <span className="face-analysis__file-name">{fileName ?? "No file chosen yet"}</span>
        </div>
        <div className="face-analysis__preview-frame">
          <div className="face-analysis__preview-box">
            {displayImageUrl ? (
              <ImageWithFallback
                src={displayImageUrl}
                alt="Uploaded face photo"
                className="face-analysis__preview-image"
                placeholderClassName="face-analysis__preview-image face-analysis__preview-placeholder"
              />
            ) : (
              <p className="face-analysis__preview-placeholder">
                Drag a portrait photo here, or click Choose file
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
          Your photo is stored privately and used only for your face-shape analysis.
        </p>
      </div>

      {isLoading && <LoadingState label="Analyzing your photo..." />}
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
              <p className="face-analysis__result-label">Face shape</p>
              <p className="face-analysis__result-value">{formatFaceShape(result.faceShape)}</p>
            </div>
            <div className="face-analysis__result-confidence">
              <p className="face-analysis__result-label">Confidence</p>
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
                Confidence is still low — try a straight-on, well-lit photo without a hat or
                glasses for a more accurate result.
              </span>
            </div>
          )}

          <div className="face-analysis__card">
            <p className="face-analysis__section-label">Face measurements</p>
            <div className="face-analysis__measurements-grid">
              {MEASUREMENT_FIELDS.map(({ key, label }) => {
                const value = result.measurements[key];
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
          </div>

          {/* recommendation-service doesn't exist yet (out of scope, plan Q2) — same
              disabled/"Coming soon" pattern as ProductDetailPage's Try AR / Add to cart. */}
          <button
            type="button"
            className="btn btn--primary"
            disabled
            title="Coming soon"
            aria-label="View recommended frames (coming soon)"
          >
            View recommended frames
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </button>
        </>
      )}
    </section>
  );
}
