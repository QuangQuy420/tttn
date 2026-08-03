package com.tttn.orderservice.dto.response;

import java.time.LocalDateTime;
import java.util.UUID;

public record ReconciliationSettingsResponse(
        Integer intervalMs,
        Integer stuckThresholdMinutes,
        Integer maxAttempts,
        LocalDateTime updatedAt,
        UUID updatedBy
) {
}
