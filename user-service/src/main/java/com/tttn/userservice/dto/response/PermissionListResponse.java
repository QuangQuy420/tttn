package com.tttn.userservice.dto.response;

import java.util.List;

public record PermissionListResponse(
        List<String> permissions
) {
}
