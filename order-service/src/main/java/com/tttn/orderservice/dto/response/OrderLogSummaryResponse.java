package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.SagaLogLevel;

import java.time.LocalDateTime;
import java.util.UUID;

public record OrderLogSummaryResponse(
        UUID orderId,
        String orderCode,
        long entryCount,
        SagaLogLevel worstLevel,
        LocalDateTime lastOccurredAt
) {
}
