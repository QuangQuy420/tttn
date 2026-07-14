"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { register } from "@/lib/api";
import { useAuthForm } from "@/hooks/useAuthForm";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
    username?: string;
    fullName?: string;
    email?: string;
    password?: string;
    confirmPassword?: string;
}

function validate(
    username: string,
    fullName: string,
    email: string,
    password: string,
    confirmPassword: string,
): FieldErrors {
    const errors: FieldErrors = {};

    if (!username.trim()) {
        errors.username = "Tên đăng nhập là bắt buộc.";
    }

    if (!fullName.trim()) {
        errors.fullName = "Họ và tên là bắt buộc.";
    }

    if (!email.trim()) {
        errors.email = "Email là bắt buộc.";
    } else if (!EMAIL_PATTERN.test(email)) {
        errors.email = "Email không hợp lệ.";
    }

    if (!password) {
        errors.password = "Mật khẩu là bắt buộc.";
    } else if (password.length < 8) {
        errors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
    }

    if (confirmPassword !== password) {
        errors.confirmPassword = "Mật khẩu xác nhận không khớp.";
    }

    return errors;
}

export function RegisterForm() {
    const router = useRouter();

    const [username, setUsername] = useState("");
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] =
        useState("");

    const [fieldErrors, setFieldErrors] =
        useState<FieldErrors>({});

    const {
        isSubmitting,
        error,
        success,
        submit,
    } = useAuthForm(register);

    async function handleSubmit(
        event: FormEvent<HTMLFormElement>,
    ) {
        event.preventDefault();

        const errors = validate(
            username,
            fullName,
            email,
            password,
            confirmPassword,
        );

        setFieldErrors(errors);

        if (Object.keys(errors).length > 0) {
            return;
        }

        const response = await submit({
            username,
            fullName,
            email,
            phone: phone || undefined,
            password,
        });

        if (!response) {
            return;
        }

        setTimeout(() => {
            router.push("/login");
        }, 700);
    }

    return (
        <form
            className="auth-form"
            onSubmit={handleSubmit}
            noValidate
        >
            <label htmlFor="register-username">
                Tên đăng nhập
                <input
                    id="register-username"
                    type="text"
                    value={username}
                    onChange={(event) =>
                        setUsername(event.target.value)
                    }
                    autoComplete="username"
                />

                {fieldErrors.username && (
                    <span className="field-error">
            {fieldErrors.username}
          </span>
                )}
            </label>

            <label htmlFor="register-full-name">
                Họ và tên
                <input
                    id="register-full-name"
                    type="text"
                    value={fullName}
                    onChange={(event) =>
                        setFullName(event.target.value)
                    }
                    autoComplete="name"
                />

                {fieldErrors.fullName && (
                    <span className="field-error">
            {fieldErrors.fullName}
          </span>
                )}
            </label>

            <label htmlFor="register-email">
                Email
                <input
                    id="register-email"
                    type="email"
                    value={email}
                    onChange={(event) =>
                        setEmail(event.target.value)
                    }
                    autoComplete="email"
                />

                {fieldErrors.email && (
                    <span className="field-error">
            {fieldErrors.email}
          </span>
                )}
            </label>

            <label htmlFor="register-phone">
                Số điện thoại
                <input
                    id="register-phone"
                    type="tel"
                    value={phone}
                    onChange={(event) =>
                        setPhone(event.target.value)
                    }
                    autoComplete="tel"
                />
            </label>

            <label htmlFor="register-password">
                Mật khẩu
                <input
                    id="register-password"
                    type="password"
                    value={password}
                    onChange={(event) =>
                        setPassword(event.target.value)
                    }
                    autoComplete="new-password"
                />

                {fieldErrors.password && (
                    <span className="field-error">
            {fieldErrors.password}
          </span>
                )}
            </label>

            <label htmlFor="register-confirm-password">
                Xác nhận mật khẩu
                <input
                    id="register-confirm-password"
                    type="password"
                    value={confirmPassword}
                    onChange={(event) =>
                        setConfirmPassword(event.target.value)
                    }
                    autoComplete="new-password"
                />

                {fieldErrors.confirmPassword && (
                    <span className="field-error">
            {fieldErrors.confirmPassword}
          </span>
                )}
            </label>

            <button type="submit" disabled={isSubmitting}>
                {isSubmitting
                    ? "Đang tạo tài khoản..."
                    : "Đăng ký"}
            </button>

            {error && (
                <p role="alert" className="error-state">
                    {error}
                </p>
            )}

            {success && (
                <p role="status">
                    Đăng ký thành công. Đang chuyển sang đăng nhập...
                </p>
            )}
        </form>
    );
}