import type { AuthResponse, LoginRequest, RegisterRequest } from "@/types/auth";
import { ApiError } from "./client";

// user-service's /api/auth/* endpoints don't exist yet (Q6, sprint-1 plan). These stub
// functions keep the same async signature a real apiFetch("/auth/...") call would have,
// so the register/login screens (T27) can be wired for real later by swapping only this
// file's implementation — nothing in the components should need to change.

const STUB_DELAY_MS = 300;

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function login(payload: LoginRequest): Promise<AuthResponse> {
  await delay(STUB_DELAY_MS);
  if (!payload.email || !payload.password) {
    throw new ApiError("Email and password are required.", 400);
  }
  return {
    token: "stub-token",
    user: { id: "stub-user-id", email: payload.email, name: payload.email.split("@")[0] },
  };
}

export async function register(payload: RegisterRequest): Promise<AuthResponse> {
  await delay(STUB_DELAY_MS);
  if (!payload.name || !payload.email || !payload.password) {
    throw new ApiError("Name, email and password are required.", 400);
  }
  return {
    token: "stub-token",
    user: { id: "stub-user-id", email: payload.email, name: payload.name },
  };
}
