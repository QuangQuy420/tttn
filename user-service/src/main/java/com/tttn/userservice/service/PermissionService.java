package com.tttn.userservice.service;

import java.util.List;
import java.util.UUID;

public interface PermissionService {

    List<String> getPermissions(UUID userId);

    boolean hasPermission(UUID userId, String permissionCode);
}
