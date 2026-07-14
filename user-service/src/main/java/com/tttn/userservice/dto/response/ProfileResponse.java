package com.tttn.userservice.dto.response;

import com.tttn.userservice.enums.Role;
import com.tttn.userservice.enums.UserStatus;

import java.time.LocalDate;
import java.util.UUID;

public record ProfileResponse(
        UUID userId,
        String email,
        String username,
        Role role,
        UserStatus status,
        String fullName,
        String phone,
        String avatarUrl,
        String address,
        LocalDate dateOfBirth
) {
}