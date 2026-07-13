package com.tttn.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(

        @NotBlank(message = "Email hoặc username không được để trống")
        String identifier,

        @NotBlank(message = "Mật khẩu không được để trống")
        String password
) {
}