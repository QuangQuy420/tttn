package com.tttn.userservice.service;

import com.tttn.userservice.dto.request.RoleCreateRequest;
import com.tttn.userservice.dto.request.RoleUpdateRequest;
import com.tttn.userservice.dto.response.PermissionResponse;
import com.tttn.userservice.dto.response.RoleResponse;
import org.springframework.data.domain.Page;

import java.util.UUID;

public interface RoleService {

    Page<RoleResponse> listRoles(int page, int limit);

    RoleResponse createRole(RoleCreateRequest request);

    RoleResponse updateRole(UUID roleId, RoleUpdateRequest request);

    void deleteRole(UUID roleId);

    Page<PermissionResponse> listPermissions(int page, int limit);
}
