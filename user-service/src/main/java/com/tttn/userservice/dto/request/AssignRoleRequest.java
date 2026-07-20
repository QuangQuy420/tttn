package com.tttn.userservice.dto.request;

import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AssignRoleRequest(

        @NotNull(message = "roleId không được để trống")
        UUID roleId
) {
}
