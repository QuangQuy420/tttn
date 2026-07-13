"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api";

interface UseAuthFormResult<TPayload, TResponse> {
  isSubmitting: boolean;
  error: string | null;
  success: boolean;
  submit: (payload: TPayload) => Promise<TResponse | null>;
}

export function useAuthForm<TPayload, TResponse>(
    action: (payload: TPayload) => Promise<TResponse>,
): UseAuthFormResult<TPayload, TResponse> {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function submit(payload: TPayload): Promise<TResponse | null> {
    setIsSubmitting(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await action(payload);
      setSuccess(true);
      return response;
    } catch (err) {
      setError(
          err instanceof ApiError
              ? err.message
              : "Something went wrong.",
      );
      return null;
    } finally {
      setIsSubmitting(false);
    }
  }

  return {
    isSubmitting,
    error,
    success,
    submit,
  };
}