package com.tttn.userservice.dto.response;

import java.util.List;
import java.util.UUID;

public record RoleResponse(
        UUID id,
        String name,
        String description,
        List<PermissionResponse> permissions
) {
}
