import type { ApiResponse } from "@/types/auth";
import type {
    CreateRoleRequest,
    Permission,
    Role,
    UpdateRoleRequest,
} from "@/types/user";
import { apiFetch } from "./client";

function authHeaders(token: string): HeadersInit {
    return {
        Authorization: `Bearer ${token}`,
    };
}

export function listRoles(token: string): Promise<ApiResponse<Role[]>> {
    return apiFetch<ApiResponse<Role[]>>("/roles", {
        method: "GET",
        headers: authHeaders(token),
    });
}

export function createRole(
    token: string,
    payload: CreateRoleRequest,
): Promise<ApiResponse<Role>> {
    return apiFetch<ApiResponse<Role>>("/roles", {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function updateRole(
    token: string,
    id: string,
    payload: UpdateRoleRequest,
): Promise<ApiResponse<Role>> {
    return apiFetch<ApiResponse<Role>>(`/roles/${encodeURIComponent(id)}`, {
        method: "PUT",
        headers: authHeaders(token),
        body: JSON.stringify(payload),
    });
}

export function deleteRole(token: string, id: string): Promise<ApiResponse<null>> {
    return apiFetch<ApiResponse<null>>(`/roles/${encodeURIComponent(id)}`, {
        method: "DELETE",
        headers: authHeaders(token),
    });
}

export function listPermissions(
    token: string,
): Promise<ApiResponse<Permission[]>> {
    return apiFetch<ApiResponse<Permission[]>>("/permissions", {
        method: "GET",
        headers: authHeaders(token),
    });
}
