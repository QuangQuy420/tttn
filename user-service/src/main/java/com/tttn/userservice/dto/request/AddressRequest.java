package com.tttn.userservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record AddressRequest(

        @NotBlank(message = "Tên người nhận không được để trống")
        @Size(
                min = 2,
                max = 100,
                message = "Tên người nhận phải từ 2 đến 100 ký tự"
        )
        String receiverName,

        @NotBlank(message = "Số điện thoại không được để trống")
        @Pattern(
                regexp = "^0\\d{9}$",
                message = "Số điện thoại phải gồm 10 chữ số và bắt đầu bằng 0"
        )
        String receiverPhone,

        @NotBlank(message = "Địa chỉ không được để trống")
        @Size(
                max = 255,
                message = "Địa chỉ không được vượt quá 255 ký tự"
        )
        String address,

        boolean isDefault
) {
}
