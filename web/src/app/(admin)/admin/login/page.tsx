"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
    ApiError,
    getMyProfile,
    login,
} from "@/lib/api";
import {
    removeAccessToken,
    saveAccessToken,
} from "@/lib/auth/session";

export default function AdminLoginPage() {
    const router = useRouter();

    const [identifier, setIdentifier] = useState("");
    const [password, setPassword] = useState("");

    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        setError("");

        if (!identifier.trim() || !password) {
            setError("Vui lòng nhập tài khoản và mật khẩu.");
            return;
        }

        setSubmitting(true);

        try {
            const loginResponse = await login({
                identifier: identifier.trim(),
                password,
            });

            const token =
                loginResponse.data.accessToken ??
                loginResponse.data.token;

            if (!token) {
                throw new Error("API không trả về access token.");
            }

            saveAccessToken(token);

            const profileResponse = await getMyProfile(token);
            const role = profileResponse.data.role?.toUpperCase();

            if (role !== "ADMIN") {
                removeAccessToken();
                setError(
                    "Tài khoản này không có quyền truy cập trang quản trị.",
                );
                return;
            }

            router.replace("/admin/products");
            router.refresh();
        } catch (err) {
            removeAccessToken();

            setError(
                err instanceof ApiError
                    ? err.message
                    : "Đăng nhập quản trị thất bại.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="admin-login-page">
            <section className="admin-login-card">
                <div className="admin-login-card__brand">
                    SMART EYEWEAR
                </div>

                <p className="admin-login-card__eyebrow">
                    Khu vực quản trị
                </p>

                <h1>Đăng nhập Admin</h1>

                <p className="admin-login-card__description">
                    Chỉ tài khoản có vai trò quản trị viên mới có thể truy cập.
                </p>

                <form
                    className="admin-login-form"
                    onSubmit={handleSubmit}
                    noValidate
                >
                    <label htmlFor="admin-identifier">
                        Email hoặc tên đăng nhập
                        <input
                            id="admin-identifier"
                            type="text"
                            value={identifier}
                            onChange={(event) =>
                                setIdentifier(event.target.value)
                            }
                            autoComplete="username"
                        />
                    </label>

                    <label htmlFor="admin-password">
                        Mật khẩu
                        <input
                            id="admin-password"
                            type="password"
                            value={password}
                            onChange={(event) =>
                                setPassword(event.target.value)
                            }
                            autoComplete="current-password"
                        />
                    </label>

                    <button type="submit" disabled={submitting}>
                        {submitting
                            ? "Đang xác thực..."
                            : "Đăng nhập quản trị"}
                    </button>

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