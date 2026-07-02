"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";

interface UseAuthFormResult<TPayload> {
  isSubmitting: boolean;
  error: string | null;
  success: boolean;
  submit: (payload: TPayload) => Promise<void>;
}

// Shared submit/loading/error/success state for the login and register forms — both call
// a stubbed src/lib/api/auth function (Q6: user-service's /api/auth/* doesn't exist yet).
export function useAuthForm<TPayload, TResponse>(
  action: (payload: TPayload) => Promise<TResponse>,
): UseAuthFormResult<TPayload> {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(payload: TPayload) {
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      await action(payload);
      setSuccess(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return { isSubmitting, error, success, submit };
}
