package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record OrderResponse(
        UUID id,
        String orderCode,
        UUID userId,
        BigDecimal totalAmount,
        OrderStatus status,
        UUID paymentId,
        String paymentMethod,
        PaymentStatus paymentStatus,
        String receiverName,
        String receiverPhone,
        String shippingAddress,
        String note,
        List<OrderItemResponse> items,
        List<OrderStatusHistoryResponse> statusHistories,
        LocalDateTime createdAt,
        LocalDateTime updatedAt
) {
}