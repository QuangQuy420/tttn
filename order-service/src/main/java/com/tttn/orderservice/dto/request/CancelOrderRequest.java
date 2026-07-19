package com.tttn.orderservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record CancelOrderRequest(

        @NotBlank(message = "Lý do hủy đơn không được để trống")
        @Size(max = 1000, message = "Lý do hủy đơn tối đa 1000 ký tự")
        String reason
) {
}