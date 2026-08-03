package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.dto.response.ReconciliationSettingsResponse;
import com.tttn.orderservice.entity.ReconciliationSettings;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.repository.ReconciliationSettingsRepository;
import com.tttn.orderservice.service.ReconciliationSettingsService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Reads/writes the single-row {@code reconciliation_settings} table that backs
 * {@code SagaReconciliationJob}'s live-tunable retry knobs. Bounds are validated here in addition
 * to {@code UpdateReconciliationSettingsRequest}'s bean-validation annotations, so the same rule
 * is enforced no matter how {@link #update} ends up being called.
 */
@Service
@RequiredArgsConstructor
public class ReconciliationSettingsServiceImpl implements ReconciliationSettingsService {

    private static final int MIN_INTERVAL_MS = 10_000;
    private static final int MIN_STUCK_THRESHOLD_MINUTES = 1;
    private static final int MIN_MAX_ATTEMPTS = 1;
    private static final int MAX_MAX_ATTEMPTS = 20;

    private final ReconciliationSettingsRepository reconciliationSettingsRepository;

    @Override
    @Transactional(readOnly = true)
    public ReconciliationSettingsResponse get() {
        return toResponse(getEntity());
    }

    @Override
    @Transactional
    public ReconciliationSettingsResponse update(
            Integer intervalMs,
            Integer stuckThresholdMinutes,
            Integer maxAttempts,
            UUID updatedBy
    ) {
        validate(intervalMs, stuckThresholdMinutes, maxAttempts);

        ReconciliationSettings settings = getEntity();
        settings.setIntervalMs(intervalMs);
        settings.setStuckThresholdMinutes(stuckThresholdMinutes);
        settings.setMaxAttempts(maxAttempts);
        settings.setUpdatedAt(LocalDateTime.now());
        settings.setUpdatedBy(updatedBy);

        return toResponse(reconciliationSettingsRepository.save(settings));
    }

    private void validate(Integer intervalMs, Integer stuckThresholdMinutes, Integer maxAttempts) {
        if (intervalMs == null || intervalMs < MIN_INTERVAL_MS) {
            throw new BadRequestException(
                    "Chu kỳ chạy job phải tối thiểu " + MIN_INTERVAL_MS + " mili-giây"
            );
        }

        if (stuckThresholdMinutes == null || stuckThresholdMinutes < MIN_STUCK_THRESHOLD_MINUTES) {
            throw new BadRequestException(
                    "Ngưỡng phát hiện đơn bị kẹt phải tối thiểu " + MIN_STUCK_THRESHOLD_MINUTES + " phút"
            );
        }

        if (maxAttempts == null
                || maxAttempts < MIN_MAX_ATTEMPTS
                || maxAttempts > MAX_MAX_ATTEMPTS) {
            throw new BadRequestException(
                    "Số lần thử lại tối đa phải từ " + MIN_MAX_ATTEMPTS + " đến " + MAX_MAX_ATTEMPTS
            );
        }
    }

    private ReconciliationSettings getEntity() {
        return reconciliationSettingsRepository
                .findFirstByOrderByUpdatedAtDesc()
                .orElseThrow(() -> new ResourceNotFoundException(
                        "Chưa có cấu hình reconciliation nào được khởi tạo"
                ));
    }

    private ReconciliationSettingsResponse toResponse(ReconciliationSettings settings) {
        return new ReconciliationSettingsResponse(
                settings.getIntervalMs(),
                settings.getStuckThresholdMinutes(),
                settings.getMaxAttempts(),
                settings.getUpdatedAt(),
                settings.getUpdatedBy()
        );
    }
}
