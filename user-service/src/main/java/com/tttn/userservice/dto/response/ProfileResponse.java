package com.tttn.userservice.dto.response;

import com.tttn.userservice.enums.UserStatus;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public record ProfileResponse(
        UUID userId,
        String email,
        String username,
        List<String> roles,
        UserStatus status,
        String fullName,
        String phone,
        String avatarUrl,
        String address,
        LocalDate dateOfBirth
) {
}