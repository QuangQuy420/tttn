package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.UUID;

public record OrderSummaryResponse(
        UUID id,
        String orderCode,
        BigDecimal totalAmount,
        OrderStatus status,
        String paymentMethod,
        PaymentStatus paymentStatus,
        String receiverName,
        String receiverPhone,
        LocalDateTime createdAt
) {
}