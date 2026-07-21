package com.tttn.userservice.service;

import com.tttn.userservice.dto.request.RoleCreateRequest;
import com.tttn.userservice.dto.request.RoleUpdateRequest;
import com.tttn.userservice.dto.response.PermissionResponse;
import com.tttn.userservice.dto.response.RoleResponse;

import java.util.List;
import java.util.UUID;

public interface RoleService {

    List<RoleResponse> listRoles();

    RoleResponse createRole(RoleCreateRequest request);

    RoleResponse updateRole(UUID roleId, RoleUpdateRequest request);

    void deleteRole(UUID roleId);

    List<PermissionResponse> listPermissions();
}
