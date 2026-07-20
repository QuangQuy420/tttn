package com.tttn.userservice.controller;

import com.tttn.userservice.dto.request.RoleCreateRequest;
import com.tttn.userservice.dto.request.RoleUpdateRequest;
import com.tttn.userservice.dto.response.ApiResponse;
import com.tttn.userservice.dto.response.PermissionResponse;
import com.tttn.userservice.dto.response.RoleResponse;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.service.PermissionService;
import com.tttn.userservice.service.RoleService;
import com.tttn.userservice.util.JwtUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequiredArgsConstructor
public class RoleController {

    private static final String MANAGE_ROLES_PERMISSION = "role:manage";

    private final RoleService roleService;
    private final PermissionService permissionService;
    private final JwtUtil jwtUtil;

    @GetMapping("/api/v1/roles")
    public ResponseEntity<ApiResponse<List<RoleResponse>>> listRoles(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader
    ) {
        requirePermission(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Lấy danh sách vai trò thành công",
                        roleService.listRoles()
                )
        );
    }

    @PostMapping("/api/v1/roles")
    public ResponseEntity<ApiResponse<RoleResponse>> createRole(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @Valid @RequestBody RoleCreateRequest request
    ) {
        requirePermission(authorizationHeader);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        "Tạo vai trò thành công",
                        roleService.createRole(request)
                ));
    }

    @PutMapping("/api/v1/roles/{roleId}")
    public ResponseEntity<ApiResponse<RoleResponse>> updateRole(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @PathVariable UUID roleId,
            @Valid @RequestBody RoleUpdateRequest request
    ) {
        requirePermission(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Cập nhật vai trò thành công",
                        roleService.updateRole(roleId, request)
                )
        );
    }

    @DeleteMapping("/api/v1/roles/{roleId}")
    public ResponseEntity<ApiResponse<Void>> deleteRole(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @PathVariable UUID roleId
    ) {
        requirePermission(authorizationHeader);

        roleService.deleteRole(roleId);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Xóa vai trò thành công",
                        null
                )
        );
    }

    @GetMapping("/api/v1/permissions")
    public ResponseEntity<ApiResponse<List<PermissionResponse>>> listPermissions(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader
    ) {
        requirePermission(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Lấy danh sách quyền thành công",
                        roleService.listPermissions()
                )
        );
    }

    private void requirePermission(String authorizationHeader) {
        UUID callingUserId = extractUserId(authorizationHeader);

        if (!permissionService.hasPermission(callingUserId, MANAGE_ROLES_PERMISSION)) {
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
