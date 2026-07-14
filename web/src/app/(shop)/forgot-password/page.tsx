"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { forgotPassword, ApiError } from "@/lib/api";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");
        setMessage("");

        const normalizedEmail = email.trim();

        if (!normalizedEmail) {
            setError("Vui lòng nhập email.");
            return;
        }

        if (!EMAIL_PATTERN.test(normalizedEmail)) {
            setError("Email không hợp lệ.");
            return;
        }

        setSubmitting(true);

        try {
            const response = await forgotPassword({
                email: normalizedEmail,
            });

            setMessage(
                response.message ??
                "Yêu cầu đặt lại mật khẩu đã được tiếp nhận.",
            );
        } catch (err) {
            setError(
                err instanceof ApiError
                    ? err.message
                    : "Không thể gửi yêu cầu đặt lại mật khẩu.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="auth-page">
            <section className="auth-card">
                <p className="auth-card__eyebrow">
                    Khôi phục tài khoản
                </p>

                <h1 className="auth-card__title">
                    Quên mật khẩu
                </h1>

                <p className="auth-card__subtitle">
                    Nhập email đã đăng ký để nhận mã đặt lại mật khẩu.
                </p>

                <form
                    className="auth-form"
                    onSubmit={handleSubmit}
                    noValidate
                >
                    <label htmlFor="forgot-password-email">
                        Email
                        <input
                            id="forgot-password-email"
                            type="email"
                            value={email}
                            onChange={(event) =>
                                setEmail(event.target.value)
                            }
                            autoComplete="email"
                            placeholder="example@gmail.com"
                        />
                    </label>

                    <button type="submit" disabled={submitting}>
                        {submitting
                            ? "Đang gửi..."
                            : "Gửi yêu cầu"}
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