"use client";

import { useState, type FormEvent } from "react";
import { login } from "@/lib/api";
import { useAuthForm } from "@/hooks/useAuthForm";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  email?: string;
  password?: string;
}

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  return errors;
}

// NOTE: user-service's /api/auth/login isn't built yet — `login()` is a stub
// (see src/lib/api/auth.ts, Q6 in the sprint-1 plan). This form is UI-complete and only
// needs its lib/api call swapped once the real endpoint exists.
export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { isSubmitting, error, success, submit } = useAuthForm(login);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(email, password);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void submit({ email, password });
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="login-email">
        Email
        <input
          id="login-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
      </label>

      <label htmlFor="login-password">
        Password
        <input
          id="login-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Logging in..." : "Log in"}
      </button>

      {error && <p role="alert" className="error-state">{error}</p>}
      {success && <p role="status">Logged in successfully.</p>}
    </form>
  );
}
