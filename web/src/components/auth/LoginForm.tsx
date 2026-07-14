"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { login } from "@/lib/api";
import { saveAccessToken } from "@/lib/auth/session";
import { useAuthForm } from "@/hooks/useAuthForm";
import Link from  "next/link";

interface FieldErrors {
  identifier?: string;
  password?: string;
}

function validate(
    identifier: string,
    password: string,
): FieldErrors {
  const errors: FieldErrors = {};

  if (!identifier.trim()) {
    errors.identifier = "Email hoặc tên đăng nhập là bắt buộc.";
  }

  if (!password) {
    errors.password = "Mật khẩu là bắt buộc.";
  } else if (password.length < 8) {
    errors.password = "Mật khẩu phải có ít nhất 8 ký tự.";
  }

  return errors;
}

export function LoginForm() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] =
      useState<FieldErrors>({});

  const {
    isSubmitting,
    error,
    submit,
  } = useAuthForm(login);

  async function handleSubmit(
      event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    const errors = validate(identifier, password);
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const response = await submit({
      identifier,
      password,
    });

    if (!response) {
      return;
    }

    const token =
        response.data.accessToken ??
        response.data.token;

    if (!token) {
      return;
    }

    saveAccessToken(token);
    router.push("/");
    router.refresh();
  }

  return (
      <form
          className="auth-form"
          onSubmit={handleSubmit}
          noValidate
      >
        <label htmlFor="login-identifier">
          Email hoặc tên đăng nhập
          <input
              id="login-identifier"
              type="text"
              value={identifier}
              onChange={(event) =>
                  setIdentifier(event.target.value)
              }
              autoComplete="username"
          />

          {fieldErrors.identifier && (
              <span className="field-error">
            {fieldErrors.identifier}
          </span>
          )}
        </label>

        <label htmlFor="login-password">
          Mật khẩu
          <input
              id="login-password"
              type="password"
              value={password}
              onChange={(event) =>
                  setPassword(event.target.value)
              }
              autoComplete="current-password"
          />
          <div className="auth-form__options">
            <Link href="/forgot-password">
              Quên mật khẩu?
            </Link>
          </div>

          {fieldErrors.password && (
              <span className="field-error">
            {fieldErrors.password}
          </span>
          )}
        </label>

        <button type="submit" disabled={isSubmitting}>
          {isSubmitting
              ? "Đang đăng nhập..."
              : "Đăng nhập"}
        </button>

        {error && (
            <p role="alert" className="error-state">
              {error}
            </p>
        )}
      </form>
  );
}