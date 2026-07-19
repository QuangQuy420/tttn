package com.tttn.orderservice.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

import java.util.UUID;

public record AddCartItemRequest(

        @NotNull(message = "Mã sản phẩm không được để trống")
        UUID productId,

        @NotNull(message = "Mã biến thể không được để trống")
        UUID variantId,

        @NotNull(message = "Số lượng không được để trống")
        @Min(value = 1, message = "Số lượng sản phẩm phải lớn hơn 0")
        Integer quantity
) {
}