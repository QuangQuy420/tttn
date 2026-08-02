package com.tttn.orderservice.entity;

import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * One entry per saga milestone for a given order (FR14) — created/stock reserve requested/
 * reserved/rejected/payment create requested/completed/failed/stock release requested/
 * reconciliation resent/exhausted/dead-lettered. Distinct from {@link OrderStatusHistory}: this
 * table is for admin/operations to inspect the full technical timeline, and gets a row on every
 * touchpoint even when {@code Order.status} itself doesn't change (e.g. a reconciliation resend).
 */
@Entity
@Table(
        name = "order_saga_logs",
        indexes = {
                @Index(
                        name = "idx_order_saga_logs_order_id",
                        columnList = "order_id"
                ),
                @Index(
                        name = "idx_order_saga_logs_occurred_at",
                        columnList = "occurred_at"
                )
        }
)
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class OrderSagaLog {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(
            name = "order_id",
            nullable = false,
            foreignKey = @ForeignKey(name = "fk_order_saga_logs_order")
    )
    private Order order;

    @Enumerated(EnumType.STRING)
    @Column(name = "stage", nullable = false, length = 40)
    private SagaLogStage stage;

    @Enumerated(EnumType.STRING)
    @Column(name = "level", nullable = false, length = 10)
    private SagaLogLevel level;

    @Column(name = "message", nullable = false, length = 1000)
    private String message;

    @Enumerated(EnumType.STRING)
    @Column(name = "source_service", nullable = false, length = 20)
    private SagaLogService sourceService;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_service", length = 20)
    private SagaLogService targetService;

    @Column(name = "error_detail", length = 1000)
    private String errorDetail;

    // Only set for RECONCILIATION_RESENT/RECONCILIATION_EXHAUSTED entries — how many automatic
    // retry attempts the order has had so far when this entry was written. Null for every other
    // stage, which isn't part of the reconciliation retry loop.
    @Column(name = "retry_count")
    private Integer retryCount;

    @Column(name = "occurred_at", nullable = false, updatable = false)
    private LocalDateTime occurredAt;

    @PrePersist
    protected void onCreate() {
        if (occurredAt == null) {
            occurredAt = LocalDateTime.now();
        }
    }
}
