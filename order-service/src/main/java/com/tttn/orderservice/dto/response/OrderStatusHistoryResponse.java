package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.OrderStatus;

import java.time.LocalDateTime;
import java.util.UUID;

public record OrderStatusHistoryResponse(
        UUID id,
        OrderStatus status,
        UUID changedBy,
        String note,
        LocalDateTime changedAt
) {
}