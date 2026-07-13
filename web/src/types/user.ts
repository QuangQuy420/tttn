export interface UserProfile {
    id?: string;
    username?: string;
    email?: string;
    fullName?: string;
    phone?: string;
    dateOfBirth?: string;
    address?: string;
}

export interface UpdateProfileRequest {
    fullName?: string;
    phone?: string;
    dateOfBirth?: string;
    address?: string;
}

export interface ChangePasswordRequest {
    currentPassword: string;
    newPassword: string;
}