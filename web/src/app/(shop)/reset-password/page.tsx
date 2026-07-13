"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { resetPassword, ApiError } from "@/lib/api";

export default function ResetPasswordPage() {
    const searchParams = useSearchParams();

    const tokenFromUrl = searchParams.get("token") ?? "";

    const [token, setToken] = useState(tokenFromUrl);
    const [newPassword, setNewPassword] = useState("");
    const [confirmPassword, setConfirmPassword] =
        useState("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");
        setMessage("");

        if (!token.trim()) {
            setError("Vui lòng nhập mã đặt lại mật khẩu.");
            return;
        }

        if (newPassword.length < 8) {
            setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Mật khẩu xác nhận không khớp.");
            return;
        }

        setSubmitting(true);

        try {
            const response = await resetPassword({
                token: token.trim(),
                newPassword,
            });

            setNewPassword("");
            setConfirmPassword("");

            setMessage(
                response.message ??
                "Đặt lại mật khẩu thành công.",
            );
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Không thể đặt lại mật khẩu.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">
                <p className="auth-card__eyebrow">
                    Bảo mật tài khoản
                </p>

                <h1 className="auth-card__title">
                    Đặt lại mật khẩu
                </h1>

                <p className="auth-card__subtitle">
                    Nhập mã đặt lại mật khẩu và mật khẩu mới.
                </p>

                <form
                    className="auth-form"
                    onSubmit={handleSubmit}
                    noValidate
                >
                    <label htmlFor="reset-token">
                        Mã đặt lại mật khẩu
                        <input
                            id="reset-token"
                            type="text"
                            value={token}
                            onChange={(event) =>
                                setToken(event.target.value)
                            }
                            autoComplete="off"
                        />
                    </label>

                    <label htmlFor="reset-new-password">
                        Mật khẩu mới
                        <input
                            id="reset-new-password"
                            type="password"
                            value={newPassword}
                            onChange={(event) =>
                                setNewPassword(event.target.value)
                            }
                            autoComplete="new-password"
                            minLength={8}
                        />
                    </label>

                    <label htmlFor="reset-confirm-password">
                        Xác nhận mật khẩu mới
                        <input
                            id="reset-confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(event) =>
                                setConfirmPassword(event.target.value)
                            }
                            autoComplete="new-password"
                            minLength={8}
                        />
                    </label>

                    <button type="submit" disabled={submitting}>
                        {submitting
                            ? "Đang cập nhật..."
                            : "Đặt lại mật khẩu"}
                    </button>

                    {message && (
                        <p role="status">{message}</p>
                    )}

                    {error && (
                        <p role="alert" className="error-state">
                            {error}
                        </p>
                    )}
                </form>

                <div className="auth-card__footer">
                    <Link href="/login">
                        Quay lại đăng nhập
                    </Link>
                </div>
            </section>
        </main>
    );
}