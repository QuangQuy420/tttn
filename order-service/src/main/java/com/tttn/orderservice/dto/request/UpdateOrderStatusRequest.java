package com.tttn.orderservice.dto.request;

import com.tttn.orderservice.enums.OrderStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

public record UpdateOrderStatusRequest(

        @NotNull(message = "Trạng thái đơn hàng không được để trống")
        OrderStatus status,

        UUID changedBy,

        @Size(max = 1000, message = "Ghi chú tối đa 1000 ký tự")
        String note
) {
}