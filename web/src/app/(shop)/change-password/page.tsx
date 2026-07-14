"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { changePassword } from "@/lib/api";
import {
    getAccessToken,
    removeAccessToken,
} from "@/lib/auth/session";
import { ApiError } from "@/lib/api";

export default function ChangePasswordPage() {
    const router = useRouter();

    const [currentPassword, setCurrentPassword] =
        useState("");
    const [newPassword, setNewPassword] =
        useState("");
    const [confirmPassword, setConfirmPassword] =
        useState("");

    const [submitting, setSubmitting] =
        useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");
        setMessage("");

        if (newPassword.length < 8) {
            setError("Mật khẩu mới phải có ít nhất 8 ký tự.");
            return;
        }

        if (newPassword !== confirmPassword) {
            setError("Mật khẩu xác nhận không khớp.");
            return;
        }

        const token = getAccessToken();

        if (!token) {
            router.replace("/login");
            return;
        }

        setSubmitting(true);

        try {
            await changePassword(token, {
                currentPassword,
                newPassword,
            });

            setCurrentPassword("");
            setNewPassword("");
            setConfirmPassword("");
            setMessage("Đổi mật khẩu thành công.");
        } catch (err) {
            if (err instanceof ApiError && err.status === 401) {
                removeAccessToken();
                router.replace("/login");
                return;
            }

            setError(
                err instanceof ApiError
                    ? err.message
                    : "Đổi mật khẩu thất bại.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="password-page">
        <section className="password-card">
        <p className="password-card__eyebrow">
            Bảo mật tài khoản
    </p>

    <h1>Đổi mật khẩu</h1>

    <p className="password-card__description">
        Sử dụng mật khẩu mạnh và không chia sẻ với người khác.
    </p>

    <form
    className="password-form"
    onSubmit={handleSubmit}
        >
        <label>
            Mật khẩu hiện tại
    <input
    type="password"
    value={currentPassword}
    onChange={(event) =>
    setCurrentPassword(event.target.value)
}
    autoComplete="current-password"
    required
    />
    </label>

    <label>
    Mật khẩu mới
    <input
    type="password"
    value={newPassword}
    onChange={(event) =>
    setNewPassword(event.target.value)
}
    autoComplete="new-password"
    minLength={8}
    required
    />
    </label>

    <label>
    Xác nhận mật khẩu mới
    <input
    type="password"
    value={confirmPassword}
    onChange={(event) =>
    setConfirmPassword(event.target.value)
}
    autoComplete="new-password"
    minLength={8}
    required
    />
    </label>

    <button
    type="submit"
    disabled={submitting}
    >
    {submitting
        ? "Đang cập nhật..."
        : "Đổi mật khẩu"}
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
    </section>
    </main>
);
}