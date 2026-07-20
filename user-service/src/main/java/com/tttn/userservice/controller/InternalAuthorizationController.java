package com.tttn.userservice.controller;

import com.tttn.userservice.dto.response.ApiResponse;
import com.tttn.userservice.dto.response.PermissionListResponse;
import com.tttn.userservice.service.PermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

@RestController
@RequestMapping("/internal/v1/users")
@RequiredArgsConstructor
public class InternalAuthorizationController {

    private final PermissionService permissionService;

    @GetMapping("/{userId}/permissions")
    public ResponseEntity<ApiResponse<PermissionListResponse>> getPermissions(
            @PathVariable UUID userId
    ) {
        PermissionListResponse response =
                new PermissionListResponse(permissionService.getPermissions(userId));

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Lấy danh sách quyền của người dùng thành công",
                        response
                )
        );
    }
}
