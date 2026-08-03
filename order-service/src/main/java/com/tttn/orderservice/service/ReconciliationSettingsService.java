package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.response.ReconciliationSettingsResponse;

import java.util.UUID;

public interface ReconciliationSettingsService {

    ReconciliationSettingsResponse get();

    ReconciliationSettingsResponse update(
            Integer intervalMs,
            Integer stuckThresholdMinutes,
            Integer maxAttempts,
            UUID updatedBy
    );
}
