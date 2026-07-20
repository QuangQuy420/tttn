package com.tttn.userservice.dto.response;

import com.tttn.userservice.enums.UserStatus;

import java.util.List;
import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String username,
        List<String> roles,
        UserStatus status
) {
}