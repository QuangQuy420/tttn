package com.tttn.orderservice.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Single-row table holding the live-tunable knobs for {@code SagaReconciliationJob}: how often it
 * ticks ({@code intervalMs}), how long an order must be silent before it's considered stuck
 * ({@code stuckThresholdMinutes}), and how many automatic resend attempts it gets before the job
 * gives up on it ({@code maxAttempts}). Replaces the old {@code app.reconciliation.*} env-var
 * config (read once at startup) with a DB row the job re-reads on every tick, so an admin can
 * change these without restarting order-service.
 */
@Entity
@Table(name = "reconciliation_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class ReconciliationSettings {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @Column(name = "interval_ms", nullable = false)
    private Integer intervalMs;

    @Column(name = "stuck_threshold_minutes", nullable = false)
    private Integer stuckThresholdMinutes;

    @Column(name = "max_attempts", nullable = false)
    private Integer maxAttempts;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    @Column(name = "updated_by")
    private UUID updatedBy;
}
