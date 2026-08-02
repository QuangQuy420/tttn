package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;

import java.time.LocalDateTime;

public record OrderSagaLogResponse(
        SagaLogStage stage,
        SagaLogLevel level,
        String message,
        SagaLogService sourceService,
        SagaLogService targetService,
        String errorDetail,
        Integer retryCount,
        LocalDateTime occurredAt
) {
}
