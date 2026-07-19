package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;

import java.math.BigDecimal;
import java.util.UUID;

public record CheckoutResponse(
        UUID orderId,
        String orderCode,
        BigDecimal totalAmount,
        OrderStatus orderStatus,
        UUID paymentId,
        PaymentStatus paymentStatus,
        String paymentUrl
) {
}