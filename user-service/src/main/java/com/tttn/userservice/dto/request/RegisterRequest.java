package com.tttn.userservice.dto.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record RegisterRequest(

        @NotBlank(message = "Email không được để trống")
        @Email(message = "Email không đúng định dạng")
        @Size(max = 50, message = "Email không được vượt quá 50 ký tự")
        String email,

        @NotBlank(message = "Username không được để trống")
        @Size(
                min = 4,
                max = 30,
                message = "Username phải từ 4 đến 30 ký tự"
        )
        @Pattern(
                regexp = "^[a-zA-Z0-9_]+$",
                message = "Username chỉ được chứa chữ cái, số và dấu gạch dưới"
        )
        String username,

        @NotBlank(message = "Mật khẩu không được để trống")
        @Size(
                min = 8,
                max = 24,
                message = "Mật khẩu phải từ 8 đến 24 ký tự"
        )
        @Pattern(
                regexp = "^(?=.*[A-Za-z])(?=.*\\d).+$",
                message = "Mật khẩu phải chứa ít nhất một chữ cái và một chữ số"
        )
        String password,

        @NotBlank(message = "Họ tên không được để trống")
        @Size(
                min = 2,
                max = 50,
                message = "Họ tên phải từ 2 đến 50 ký tự"
        )
        @Pattern(
                regexp = "^[\\p{L} .'-]+$",
                message = "Họ tên chứa ký tự không hợp lệ"
        )
        String fullName,

        @Pattern(
                regexp = "^$|^0\\d{9}$",
                message = "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
        )
        String phone
) {
}