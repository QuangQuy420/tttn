package com.tttn.orderservice.controller;

import com.tttn.orderservice.dto.request.UpdateReconciliationSettingsRequest;
import com.tttn.orderservice.dto.response.ReconciliationSettingsResponse;
import com.tttn.orderservice.service.ReconciliationSettingsService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Admin-only read/write API over {@code SagaReconciliationJob}'s live retry settings — same
 * "no in-service permission guard" convention as {@link AdminSagaLogController}: permission
 * checking (`saga-settings:manage`) happens at api-gateway's {@code PermissionsGuard}, this
 * service trusts the gateway.
 */
@RestController
@RequestMapping("/api/v1/admin/saga-settings")
@RequiredArgsConstructor
public class AdminReconciliationSettingsController {

    private final ReconciliationSettingsService reconciliationSettingsService;

    @GetMapping
    public ResponseEntity<ReconciliationSettingsResponse> getSettings() {
        return ResponseEntity.ok(reconciliationSettingsService.get());
    }

    @PutMapping
    public ResponseEntity<ReconciliationSettingsResponse> updateSettings(
            @RequestHeader("X-User-Id")
            UUID updatedBy,
            @Valid @RequestBody
            UpdateReconciliationSettingsRequest request
    ) {
        return ResponseEntity.ok(
                reconciliationSettingsService.update(
                        request.intervalMs(),
                        request.stuckThresholdMinutes(),
                        request.maxAttempts(),
                        updatedBy
                )
        );
    }
}
