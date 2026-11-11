package com.tttn.userservice.service;

import com.tttn.userservice.dto.response.PermissionListResponse;

import java.util.List;
import java.util.UUID;

public interface PermissionService {

    List<String> getPermissions(UUID userId);

    // Permissions plus the token-revocation state the gateway checks on every JWT route.
    PermissionListResponse getAuthorizationState(UUID userId);

    boolean hasPermission(UUID userId, String permissionCode);
}
