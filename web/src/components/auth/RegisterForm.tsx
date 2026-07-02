"use client";

import { useState, type FormEvent } from "react";
import { register } from "@/lib/api";
import { useAuthForm } from "@/hooks/useAuthForm";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface FieldErrors {
  name?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

function validate(
  name: string,
  email: string,
  password: string,
  confirmPassword: string,
): FieldErrors {
  const errors: FieldErrors = {};
  if (!name) errors.name = "Name is required.";
  if (!email) errors.email = "Email is required.";
  else if (!EMAIL_PATTERN.test(email)) errors.email = "Enter a valid email address.";
  if (!password) errors.password = "Password is required.";
  else if (password.length < 8) errors.password = "Password must be at least 8 characters.";
  if (confirmPassword !== password) errors.confirmPassword = "Passwords do not match.";
  return errors;
}

// NOTE: user-service's /api/auth/register isn't built yet — `register()` is a stub
// (see src/lib/api/auth.ts, Q6 in the sprint-1 plan). This form is UI-complete and only
// needs its lib/api call swapped once the real endpoint exists.
export function RegisterForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const { isSubmitting, error, success, submit } = useAuthForm(register);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const errors = validate(name, email, password, confirmPassword);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    void submit({ name, email, password });
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor="register-name">
        Name
        <input
          id="register-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
        {fieldErrors.name && <span className="field-error">{fieldErrors.name}</span>}
      </label>

      <label htmlFor="register-email">
        Email
        <input
          id="register-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
      </label>

      <label htmlFor="register-password">
        Password
        <input
          id="register-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
        />
        {fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
      </label>

      <label htmlFor="register-confirm-password">
        Confirm password
        <input
          id="register-confirm-password"
          type="password"
          value={confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        {fieldErrors.confirmPassword && (
          <span className="field-error">{fieldErrors.confirmPassword}</span>
        )}
      </label>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating account..." : "Register"}
      </button>

      {error && <p role="alert" className="error-state">{error}</p>}
      {success && <p role="status">Account created successfully.</p>}
    </form>
  );
}
