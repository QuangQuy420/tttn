export interface LoginRequest {
  identifier: string;
  password: string;
}

export interface RegisterRequest {
  username: string;
  email: string;
  password: string;
  fullName?: string;
  phone?: string;
}

export interface ForgotPasswordRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export interface LoginData {
  accessToken?: string;
  token?: string;
  tokenType?: string;
  expiresIn?: number;
}

export interface ApiResponse<T> {
  success?: boolean;
  message?: string;
  data: T;
}