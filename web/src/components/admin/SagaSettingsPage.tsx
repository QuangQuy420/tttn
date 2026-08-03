"use client";

import { useEffect, useState, type FormEvent } from "react";
import { ErrorState } from "@/components/common/ErrorState";
import { LoadingState } from "@/components/common/LoadingState";
import { ApiError, getSagaSettings, updateSagaSettings } from "@/lib/api";
import { getAccessToken } from "@/lib/auth/session";

interface FormState {
  intervalMs: string;
  stuckThresholdMinutes: string;
  maxAttempts: string;
}

function blankForm(): FormState {
  return { intervalMs: "", stuckThresholdMinutes: "", maxAttempts: "" };
}

// Admin "Cài đặt" tab (T16, AC4) — view/edit the checkout saga reconciliation job's live retry
// config (retry interval, stuck threshold, max attempts). Bounds mirror order-service's
// UpdateReconciliationSettingsRequest / api-gateway's UpdateSagaSettingsDto (plan Q1): interval
// >= 10000ms, stuck threshold >= 1 minute, max attempts 1-20. Field/validation/submit flow
// modeled on ProductEditForm.tsx's numeric-field pattern.
export function SagaSettingsPage() {
  const [form, setForm] = useState<FormState>(blankForm());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const token = getAccessToken();
      if (!token) {
        if (!cancelled) {
          setLoadError("Vui lòng đăng nhập lại.");
          setIsLoading(false);
        }
        return;
      }

      try {
        const settings = await getSagaSettings(token);
        if (cancelled) return;
        setForm({
          intervalMs: String(settings.intervalMs),
          stuckThresholdMinutes: String(settings.stuckThresholdMinutes),
          maxAttempts: String(settings.maxAttempts),
        });
        setUpdatedAt(settings.updatedAt);
      } catch (err) {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Không thể tải cấu hình.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setMessage(null);

    const intervalMs = Number(form.intervalMs);
    const stuckThresholdMinutes = Number(form.stuckThresholdMinutes);
    const maxAttempts = Number(form.maxAttempts);

    if (!Number.isInteger(intervalMs) || intervalMs < 10000) {
      setError("Chu kỳ thử lại phải là số nguyên, tối thiểu 10000 mili-giây.");
      return;
    }
    if (!Number.isInteger(stuckThresholdMinutes) || stuckThresholdMinutes < 1) {
      setError("Ngưỡng đơn hàng bị kẹt phải là số nguyên, tối thiểu 1 phút.");
      return;
    }
    if (!Number.isInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 20) {
      setError("Số lần thử lại tối đa phải là số nguyên trong khoảng từ 1 đến 20.");
      return;
    }

    const token = getAccessToken();
    if (!token) {
      setError("Vui lòng đăng nhập lại.");
      return;
    }

    setIsSubmitting(true);
    try {
      const updated = await updateSagaSettings(token, {
        intervalMs,
        stuckThresholdMinutes,
        maxAttempts,
      });
      setForm({
        intervalMs: String(updated.intervalMs),
        stuckThresholdMinutes: String(updated.stuckThresholdMinutes),
        maxAttempts: String(updated.maxAttempts),
      });
      setUpdatedAt(updated.updatedAt);
      setMessage("Đã lưu cấu hình thành công.");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Lưu cấu hình thất bại.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) return <LoadingState label="Đang tải cấu hình..." />;
  if (loadError) return <ErrorState message={loadError} />;

  return (
    <>
      <header className="admin-form-header">
        <div className="admin-form-header__actions">
          <button
            type="submit"
            form="saga-settings-form"
            className="btn btn--primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Đang lưu…" : "Lưu cấu hình"}
          </button>
        </div>
      </header>

      <form id="saga-settings-form" className="admin-form" onSubmit={handleSubmit}>
        <div className="admin-form__title">Cài đặt thử lại saga</div>
        <div className="admin-form__subtitle">
          Điều chỉnh chu kỳ, ngưỡng và số lần thử lại của tiến trình xử lý đơn hàng bị kẹt giữa
          chừng khi thanh toán.
        </div>

        {error && <p className="field-error">{error}</p>}
        {message && <p role="status">{message}</p>}

        <div className="admin-form-card">
          <div className="admin-form-card__title">Tham số thử lại</div>

          <label className="admin-form-field" htmlFor="settings-interval-ms">
            Chu kỳ thử lại (mili-giây)
          </label>
          <input
            id="settings-interval-ms"
            type="number"
            min={10000}
            step={1000}
            className="admin-form-input"
            value={form.intervalMs}
            onChange={(event) => updateField("intervalMs", event.target.value)}
          />

          <label className="admin-form-field" htmlFor="settings-stuck-threshold">
            Ngưỡng đơn hàng bị kẹt (phút)
          </label>
          <input
            id="settings-stuck-threshold"
            type="number"
            min={1}
            step={1}
            className="admin-form-input"
            value={form.stuckThresholdMinutes}
            onChange={(event) => updateField("stuckThresholdMinutes", event.target.value)}
          />

          <label className="admin-form-field" htmlFor="settings-max-attempts">
            Số lần thử lại tối đa
          </label>
          <input
            id="settings-max-attempts"
            type="number"
            min={1}
            max={20}
            step={1}
            className="admin-form-input"
            value={form.maxAttempts}
            onChange={(event) => updateField("maxAttempts", event.target.value)}
          />
        </div>

        {updatedAt && (
          <p className="admin-table__tag">
            Cập nhật lần cuối: {new Date(updatedAt).toLocaleString("vi-VN")}
          </p>
        )}
      </form>
    </>
  );
}
