package com.tttn.orderservice.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

public record CheckoutRequest(

        @NotBlank(message = "Tên người nhận không được để trống")
        @Size(max = 150, message = "Tên người nhận tối đa 150 ký tự")
        String receiverName,

        @NotBlank(message = "Số điện thoại không được để trống")
        @Pattern(
                regexp = "^(0|\\+84)[0-9]{9,10}$",
                message = "Số điện thoại không hợp lệ"
        )
        String receiverPhone,

        @NotBlank(message = "Địa chỉ giao hàng không được để trống")
        @Size(max = 500, message = "Địa chỉ giao hàng tối đa 500 ký tự")
        String shippingAddress,

        @Size(max = 1000, message = "Ghi chú tối đa 1000 ký tự")
        String note,

        @NotBlank(message = "Phương thức thanh toán không được để trống")
        String paymentMethod,

        @NotEmpty(message = "Vui lòng chọn ít nhất 1 sản phẩm để thanh toán")
        List<UUID> variantIds
) {
}