package com.tttn.userservice.controller;

import com.tttn.userservice.dto.request.AssignRoleRequest;
import com.tttn.userservice.dto.response.ApiResponse;
import com.tttn.userservice.dto.response.UserResponse;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.service.PermissionService;
import com.tttn.userservice.service.UserRolesService;
import com.tttn.userservice.util.JwtUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users/{userId}/roles")
@RequiredArgsConstructor
public class UserRolesController {

    private static final String MANAGE_USER_ROLES_PERMISSION = "user:manage-roles";

    private final UserRolesService userRolesService;
    private final PermissionService permissionService;
    private final JwtUtil jwtUtil;

    @PostMapping
    public ResponseEntity<ApiResponse<UserResponse>> assignRole(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @PathVariable UUID userId,
            @Valid @RequestBody AssignRoleRequest request
    ) {
        requirePermission(authorizationHeader);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        "Gán vai trò cho người dùng thành công",
                        userRolesService.assignRole(userId, request.roleId())
                ));
    }

    @DeleteMapping("/{roleId}")
    public ResponseEntity<ApiResponse<UserResponse>> removeRole(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @PathVariable UUID userId,
            @PathVariable UUID roleId
    ) {
        requirePermission(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Gỡ vai trò khỏi người dùng thành công",
                        userRolesService.removeRole(userId, roleId)
                )
        );
    }

    private void requirePermission(String authorizationHeader) {
        UUID callingUserId = extractUserId(authorizationHeader);

        if (!permissionService.hasPermission(callingUserId, MANAGE_USER_ROLES_PERMISSION)) {
            throw new BusinessException(ErrorCode.FORBIDDEN);
        }
    }

    private UUID extractUserId(String authorizationHeader) {
        if (authorizationHeader == null
                || !authorizationHeader.startsWith("Bearer ")) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        String token = authorizationHeader.substring(7);

        if (!jwtUtil.validateToken(token)) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        return jwtUtil.extractUserId(token);
    }
}
