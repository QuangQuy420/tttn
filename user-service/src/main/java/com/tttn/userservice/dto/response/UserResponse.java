package com.tttn.userservice.dto.response;

import com.tttn.userservice.enums.Role;
import com.tttn.userservice.enums.UserStatus;

import java.util.UUID;

public record UserResponse(
        UUID id,
        String email,
        String username,
        Role role,
        UserStatus status
) {
}