package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.response.UserResponse;
import com.tttn.userservice.entity.Permission;
import com.tttn.userservice.entity.Role;
import com.tttn.userservice.entity.User;
import com.tttn.userservice.enums.UserStatus;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.RoleRepository;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.PermissionService;
import com.tttn.userservice.service.UserRolesService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserRolesServiceImpl implements UserRolesService {

    private static final String ADMIN_ROLE_NAME = "ADMIN";

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PermissionService permissionService;

    @Override
    @Transactional
    public UserResponse assignRole(UUID callingUserId, UUID userId, UUID roleId) {
        User user = findUser(userId);
        Role role = findRole(roleId);

        List<String> callerPermissions = permissionService.getPermissions(callingUserId);
        boolean callerHoldsAll = role.getPermissions()
                .stream()
                .map(Permission::getCode)
                .allMatch(callerPermissions::contains);

        if (!callerHoldsAll) {
            throw new BusinessException(ErrorCode.ROLE_EXCEEDS_CALLER_PERMISSIONS);
        }

        user.getRoles().add(role);
        user = userRepository.save(user);

        return toUserResponse(user);
    }

    @Override
    @Transactional
    public UserResponse removeRole(UUID userId, UUID roleId) {
        // Lock the role row first: a concurrent removal of the same role waits here until this
        // transaction commits, so its last-admin count below sees our removal.
        Role role = roleRepository.findByIdForUpdate(roleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROLE_NOT_FOUND));
        User user = findUser(userId);

        if (!user.getRoles().contains(role)) {
            throw new BusinessException(ErrorCode.USER_ROLE_NOT_ASSIGNED);
        }

        // Never leave the system without an ACTIVE admin (removing it from an inactive user
        // does not change that count).
        if (ADMIN_ROLE_NAME.equals(role.getName())
                && user.getStatus() == UserStatus.ACTIVE
                && userRepository.countByRoleNameAndStatus(ADMIN_ROLE_NAME, UserStatus.ACTIVE) <= 1) {
            throw new BusinessException(ErrorCode.LAST_ADMIN);
        }

        user.getRoles().remove(role);

        user = userRepository.save(user);

        return toUserResponse(user);
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    private Role findRole(UUID roleId) {
        return roleRepository.findById(roleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROLE_NOT_FOUND));
    }

    private UserResponse toUserResponse(User user) {
        List<String> roleNames = user.getRoles()
                .stream()
                .map(Role::getName)
                .toList();

        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                roleNames,
                user.getStatus()
        );
    }
}
