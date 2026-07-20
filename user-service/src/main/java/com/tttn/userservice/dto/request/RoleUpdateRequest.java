package com.tttn.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.Set;
import java.util.UUID;

public record RoleUpdateRequest(

        @NotBlank(message = "Tên vai trò không được để trống")
        @Size(
                min = 2,
                max = 50,
                message = "Tên vai trò phải từ 2 đến 50 ký tự"
        )
        String name,

        @Size(
                max = 255,
                message = "Mô tả không được vượt quá 255 ký tự"
        )
        String description,

        @NotNull(message = "Danh sách quyền không được để trống")
        Set<UUID> permissionIds
) {
}
