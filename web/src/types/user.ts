export interface UserProfile {
    userId: string;
    email: string;
    username: string;
    role: string;
    status: string;
    fullName?: string | null;
    phone?: string | null;
    avatarUrl?: string | null;
    address?: string | null;
    dateOfBirth?: string | null;
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