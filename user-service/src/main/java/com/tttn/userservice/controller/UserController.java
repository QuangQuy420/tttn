package com.tttn.userservice.controller;

import com.tttn.userservice.dto.request.ChangePasswordRequest;
import com.tttn.userservice.dto.request.UpdateProfileRequest;
import com.tttn.userservice.dto.response.ApiResponse;
import com.tttn.userservice.dto.response.PaginatedResponse;
import com.tttn.userservice.dto.response.ProfileResponse;
import com.tttn.userservice.dto.response.UserResponse;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.service.PermissionService;
import com.tttn.userservice.service.UserService;
import com.tttn.userservice.util.JwtUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/users")
@RequiredArgsConstructor
public class UserController {

    private static final String MANAGE_USER_ROLES_PERMISSION = "user:manage-roles";

    private final UserService userService;
    private final PermissionService permissionService;
    private final JwtUtil jwtUtil;

    @GetMapping
    public ResponseEntity<ApiResponse<PaginatedResponse<UserResponse>>> listUsers(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "limit", defaultValue = "20") int limit
    ) {
        requirePermission(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Lấy danh sách người dùng thành công",
                        userService.listUsers(page, limit)
                )
        );
    }

    @GetMapping("/me")
    public ResponseEntity<ApiResponse<ProfileResponse>> getProfile(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader
    ) {
        UUID userId = extractUserId(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Lấy thông tin cá nhân thành công",
                        userService.getProfile(userId)
                )
        );
    }

    @PutMapping("/me")
    public ResponseEntity<ApiResponse<ProfileResponse>> updateProfile(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @Valid @RequestBody UpdateProfileRequest request
    ) {
        UUID userId = extractUserId(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Cập nhật thông tin cá nhân thành công",
                        userService.updateProfile(userId, request)
                )
        );
    }

    @PutMapping("/change-password")
    public ResponseEntity<ApiResponse<Void>> changePassword(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @Valid @RequestBody ChangePasswordRequest request
    ) {
        UUID userId = extractUserId(authorizationHeader);

        userService.changePassword(userId, request);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Đổi mật khẩu thành công",
                        null
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