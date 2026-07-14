import type { ApiResponse } from "@/types/auth";
import type {
    ChangePasswordRequest,
    UpdateProfileRequest,
    UserProfile,
} from "@/types/user";
import { apiFetch } from "./client";

function authHeaders(token: string): HeadersInit {
    return {
        Authorization: `Bearer ${token}`,
    };
}

export function getMyProfile(
    token: string,
): Promise<ApiResponse<UserProfile>> {
    return apiFetch<ApiResponse<UserProfile>>("/users/me", {
        method: "GET",
        headers: authHeaders(token),
    });
}

export function updateMyProfile(
    token: string,
    payload: UpdateProfileRequest,
): Promise<ApiResponse<UserProfile>> {
    return apiFetch<ApiResponse<UserProfile>>("/users/me", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function changePassword(
    token: string,
    payload: ChangePasswordRequest,
): Promise<ApiResponse<unknown>> {
    return apiFetch<ApiResponse<unknown>>("/users/change-password", {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}