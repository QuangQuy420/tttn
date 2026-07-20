package com.tttn.orderservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateCartItemRequest(

        @NotNull(message = "Số lượng không được để trống")
        @Min(value = 1, message = "Số lượng sản phẩm phải lớn hơn 0")
        Integer quantity
) {
}