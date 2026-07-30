package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.OrderStatus;

import java.util.Map;

public record AdminOrderSummaryResponse(
        long totalOrders,
        Map<OrderStatus, Long> ordersByStatus
) {
}
