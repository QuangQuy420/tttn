package com.tttn.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(

        @NotBlank(message = "Email hoặc username không được để trống")
        @Size(
                max = 30,
                message = "Email hoặc username không được vượt quá 30 ký tự"
        )
        String identifier,

        @NotBlank(message = "Mật khẩu không được để trống")
        @Size(
                max = 24,
                message = "Mật khẩu không được vượt quá 24 ký tự"
        )
        String password
) {
}