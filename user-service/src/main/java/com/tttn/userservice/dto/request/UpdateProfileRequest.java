package com.tttn.userservice.dto.request;

import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;

public record UpdateProfileRequest(

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
        String phone,

        @Size(
                max = 500,
                message = "Đường dẫn ảnh đại diện không được vượt quá 500 ký tự"
        )
        String avatarUrl,

        @Size(
                max = 255,
                message = "Địa chỉ không được vượt quá 255 ký tự"
        )
        String address,

        @Past(message = "Ngày sinh phải là ngày trong quá khứ")
        LocalDate dateOfBirth
) {
}