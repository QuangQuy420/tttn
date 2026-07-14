import type {
  ApiResponse,
  ForgotPasswordRequest,
  LoginData,
  LoginRequest,
  RegisterRequest,
  ResetPasswordRequest,
} from "@/types/auth";
import { apiFetch } from "./client";

export function login(
    payload: LoginRequest,
): Promise<ApiResponse<LoginData>> {
  return apiFetch<ApiResponse<LoginData>>("/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function register(
    payload: RegisterRequest,
): Promise<ApiResponse<unknown>> {
  return apiFetch<ApiResponse<unknown>>("/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function forgotPassword(
    payload: ForgotPasswordRequest,
): Promise<ApiResponse<unknown>> {
  return apiFetch<ApiResponse<unknown>>("/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetPassword(
    payload: ResetPasswordRequest,
): Promise<ApiResponse<unknown>> {
  return apiFetch<ApiResponse<unknown>>("/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}