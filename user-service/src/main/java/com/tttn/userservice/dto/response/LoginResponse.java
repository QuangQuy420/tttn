package com.tttn.userservice.dto.response;

public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresIn,
        UserResponse user
) {
}