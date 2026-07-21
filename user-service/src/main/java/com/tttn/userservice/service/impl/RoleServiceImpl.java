package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.request.RoleCreateRequest;
import com.tttn.userservice.dto.request.RoleUpdateRequest;
import com.tttn.userservice.dto.response.PermissionResponse;
import com.tttn.userservice.dto.response.RoleResponse;
import com.tttn.userservice.entity.Permission;
import com.tttn.userservice.entity.Role;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.PermissionRepository;
import com.tttn.userservice.repository.RoleRepository;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.RoleService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class RoleServiceImpl implements RoleService {

    private final RoleRepository roleRepository;
    private final PermissionRepository permissionRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public List<RoleResponse> listRoles() {
        return roleRepository.findAll()
                .stream()
                .map(this::toRoleResponse)
                .toList();
    }

    @Override
    @Transactional
    public RoleResponse createRole(RoleCreateRequest request) {
        String name = request.name().trim();

        if (roleRepository.existsByNameIgnoreCase(name)) {
            throw new BusinessException(ErrorCode.ROLE_ALREADY_EXISTS);
        }

        Set<Permission> permissions = resolvePermissions(request.permissionIds());

        Role role = Role.builder()
                .name(name)
                .description(normalizeNullable(request.description()))
                .permissions(permissions)
                .build();

        role = roleRepository.save(role);

        return toRoleResponse(role);
    }

    @Override
    @Transactional
    public RoleResponse updateRole(UUID roleId, RoleUpdateRequest request) {
        Role role = findRole(roleId);

        String name = request.name().trim();

        if (!name.equalsIgnoreCase(role.getName())
                && roleRepository.existsByNameIgnoreCase(name)) {
            throw new BusinessException(ErrorCode.ROLE_ALREADY_EXISTS);
        }

        Set<Permission> permissions = resolvePermissions(request.permissionIds());

        role.setName(name);
        role.setDescription(normalizeNullable(request.description()));
        role.setPermissions(permissions);

        role = roleRepository.save(role);

        return toRoleResponse(role);
    }

    @Override
    @Transactional
    public void deleteRole(UUID roleId) {
        Role role = findRole(roleId);

        if (userRepository.existsByRolesId(role.getId())) {
            throw new BusinessException(ErrorCode.ROLE_IN_USE);
        }

        roleRepository.delete(role);
    }

    @Override
    @Transactional(readOnly = true)
    public List<PermissionResponse> listPermissions() {
        return permissionRepository.findAll()
                .stream()
                .map(this::toPermissionResponse)
                .toList();
    }

    private Role findRole(UUID roleId) {
        return roleRepository.findById(roleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROLE_NOT_FOUND));
    }

    private Set<Permission> resolvePermissions(Set<UUID> permissionIds) {
        List<Permission> found = permissionRepository.findAllById(permissionIds);

        if (found.size() != permissionIds.size()) {
            throw new BusinessException(ErrorCode.PERMISSION_NOT_FOUND);
        }

        return new HashSet<>(found);
    }

    private RoleResponse toRoleResponse(Role role) {
        List<PermissionResponse> permissions = role.getPermissions()
                .stream()
                .map(this::toPermissionResponse)
                .toList();

        return new RoleResponse(
                role.getId(),
                role.getName(),
                role.getDescription(),
                permissions
        );
    }

    private PermissionResponse toPermissionResponse(Permission permission) {
        return new PermissionResponse(
                permission.getId(),
                permission.getCode(),
                permission.getDescription()
        );
    }

    private String normalizeNullable(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}
