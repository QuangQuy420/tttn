package com.tttn.userservice.service;

import com.tttn.userservice.dto.request.ChangePasswordRequest;
import com.tttn.userservice.dto.request.UpdateProfileRequest;
import com.tttn.userservice.dto.response.ProfileResponse;

import java.util.UUID;

public interface UserService {

    ProfileResponse getProfile(UUID userId);

    ProfileResponse updateProfile(
            UUID userId,
            UpdateProfileRequest request
    );

    void changePassword(
            UUID userId,
            ChangePasswordRequest request
    );
}