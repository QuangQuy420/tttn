package com.tttn.userservice.service.impl;

import com.tttn.userservice.entity.Permission;
import com.tttn.userservice.entity.Role;
import com.tttn.userservice.entity.User;
import com.tttn.userservice.enums.UserStatus;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.RoleRepository;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.PermissionService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.http.HttpStatus;

import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserRolesServiceGuardRailsTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private RoleRepository roleRepository;

    @Mock
    private PermissionService permissionService;

    private UserRolesServiceImpl userRolesService;

    @BeforeEach
    void setUp() {
        userRolesService = new UserRolesServiceImpl(
                userRepository,
                roleRepository,
                permissionService
        );
    }

    @Test
    void removeRole_adminFromLastActiveAdmin_throwsLastAdmin_AC9() {
        Role adminRole = role("ADMIN", "role:manage", "user:manage-roles");
        User admin = user(UserStatus.ACTIVE, adminRole);
        when(userRepository.findById(admin.getId())).thenReturn(Optional.of(admin));
        when(roleRepository.findByIdForUpdate(adminRole.getId()))
                .thenReturn(Optional.of(adminRole));
        when(userRepository.countByRoleNameAndStatus("ADMIN", UserStatus.ACTIVE))
                .thenReturn(1L);

        assertThatThrownBy(() ->
                userRolesService.removeRole(admin.getId(), adminRole.getId())
        ).isInstanceOfSatisfying(BusinessException.class, exception -> {
            assertThat(exception.getErrorCode()).isEqualTo(ErrorCode.LAST_ADMIN);
            assertThat(exception.getErrorCode().getHttpStatus())
                    .isEqualTo(HttpStatus.CONFLICT);
            assertThat(exception.getMessage())
                    .isEqualTo("Không thể gỡ vai trò ADMIN khỏi quản trị viên cuối cùng");
        });

        assertThat(admin.getRoles()).containsExactly(adminRole);
        verify(userRepository, never()).save(any(User.class));
    }

    @Test
    void assignRole_roleAboveCallerPermissions_throws403_AC10() {
        UUID callerId = UUID.randomUUID();
        Role adminRole = role("ADMIN", "role:manage", "user:manage-roles");
        User target = user(UserStatus.ACTIVE);
        when(userRepository.findById(target.getId())).thenReturn(Optional.of(target));
        when(roleRepository.findById(adminRole.getId())).thenReturn(Optional.of(adminRole));
        // Caller can manage user roles but does not hold role:manage.
        when(permissionService.getPermissions(callerId))
                .thenReturn(List.of("user:manage-roles"));

        assertThatThrownBy(() ->
                userRolesService.assignRole(callerId, target.getId(), adminRole.getId())
        ).isInstanceOfSatisfying(BusinessException.class, exception -> {
            assertThat(exception.getErrorCode())
                    .isEqualTo(ErrorCode.ROLE_EXCEEDS_CALLER_PERMISSIONS);
            assertThat(exception.getErrorCode().getHttpStatus())
                    .isEqualTo(HttpStatus.FORBIDDEN);
            assertThat(exception.getMessage())
                    .isEqualTo("Bạn không thể gán vai trò có quyền mà bạn chưa có");
        });

        assertThat(target.getRoles()).isEmpty();
        verify(userRepository, never()).save(any(User.class));
    }

    private static Role role(String name, String... permissionCodes) {
        Set<Permission> permissions = new HashSet<>();
        for (String code : permissionCodes) {
            Permission permission = Permission.builder().code(code).build();
            permission.setId(UUID.randomUUID());
            permissions.add(permission);
        }

        Role role = Role.builder().name(name).permissions(permissions).build();
        role.setId(UUID.randomUUID());
        return role;
    }

    private static User user(UserStatus status, Role... roles) {
        User user = User.builder()
                .email("u@example.com")
                .username("user")
                .status(status)
                .roles(new HashSet<>(List.of(roles)))
                .build();
        user.setId(UUID.randomUUID());
        return user;
    }
}
