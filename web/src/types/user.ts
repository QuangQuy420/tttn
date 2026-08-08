export interface UserProfile {
    userId: string;
    email: string;
    username: string;
    roles: string[];
    permissions: string[];
    status: string;
    fullName?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    address?: string | null;
    dateOfBirth?: string | null;
}

// Mirrors user-service's PermissionResponse (id, code, description) — the fixed,
// developer-seeded catalog exposed read-only via GET /api/permissions. There is no
// endpoint to create a new permission code (AC6).
export interface Permission {
    id: string;
    code: string;
    description?: string | null;
}

// Mirrors user-service's RoleResponse, returned by GET/POST/PUT /api/roles. `permissions`
// is the role's full permission objects (not just codes), for the admin UI's checkbox grid.
export interface Role {
    id: string;
    name: string;
    description?: string | null;
    permissions: Permission[];
}

// Mirrors user-service's RoleCreateRequest/RoleUpdateRequest — permissions are chosen by
// id (from the fixed catalog), not by code.
export interface CreateRoleRequest {
    name: string;
    description?: string;
    permissionIds: string[];
}

export interface UpdateRoleRequest {
    name: string;
    description?: string;
    permissionIds: string[];
}

export interface UpdateProfileRequest {
    fullName?: string;
    phone?: string;
    avatarUrl?: string;
    address?: string;
    dateOfBirth?: string;
}

export interface ChangePasswordRequest {
    currentPassword: string;
    newPassword: string;
}

// Mirrors user-service's AddressResponse — a saved shipping address the user can pick at
// checkout instead of retyping receiver/address fields every time.
export interface Address {
    id: string;
    receiverName: string;
    receiverPhone: string;
    address: string;
    isDefault: boolean;
    createdAt: string;
}

// Mirrors user-service's AddressRequest.
export interface CreateAddressRequest {
    receiverName: string;
    receiverPhone: string;
    address: string;
    isDefault: boolean;
}
