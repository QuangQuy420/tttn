// user-service's /api/auth/* contract doesn't exist yet (see Q6 in the sprint-1 plan) —
// this shape is a placeholder for the stubbed client in src/lib/api/auth.ts and will need
// to be reconciled with the real contract once user-service publishes it.
export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}
