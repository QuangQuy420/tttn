package com.tttn.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record ChangePasswordRequest(

        @NotBlank(message = "Mật khẩu hiện tại không được để trống")
        @Size(
                max = 24,
                message = "Mật khẩu hiện tại không được vượt quá 24 ký tự"
        )
        String currentPassword,

        @NotBlank(message = "Mật khẩu mới không được để trống")
        @Size(
                min = 8,
                max = 24,
                message = "Mật khẩu mới phải từ 8 đến 24 ký tự"
        )
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$",
                message = "Mật khẩu mới phải chứa ít nhất một chữ cái và một chữ số"
        )
        String newPassword
) {
}