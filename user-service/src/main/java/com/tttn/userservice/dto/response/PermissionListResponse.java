package com.tttn.userservice.dto.response;

import com.tttn.userservice.enums.UserStatus;

import java.util.List;

// tokensValidAfter: epoch seconds (UTC), or null when no token was ever revoked. The gateway
// rejects a JWT whose iat is below it, or whose user status is not ACTIVE.
public record PermissionListResponse(
        List<String> permissions,
        UserStatus status,
        Long tokensValidAfter
) {
}
