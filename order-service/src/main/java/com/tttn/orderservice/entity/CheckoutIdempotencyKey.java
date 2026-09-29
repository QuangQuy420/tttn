package com.tttn.orderservice.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * An {@code Idempotency-Key} a user sent with a checkout, saved in the same transaction as the
 * order it created. {@code (userId, idempotencyKey)} is UNIQUE, so a concurrent duplicate fails
 * on insert and rolls its own order back. {@code requestHash} detects the same key reused for a
 * different body; {@code responseBody} is the {@code CheckoutResponse} snapshot replayed to
 * retries until {@code expiresAt}.
 */
@Entity
@Table(name = "checkout_idempotency_keys")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CheckoutIdempotencyKey {

    @Id
    @Builder.Default
    @Column(name = "id", nullable = false, updatable = false)
    private UUID id = UUID.randomUUID();

    @Column(name = "user_id", nullable = false)
    private UUID userId;

    @Column(name = "idempotency_key", nullable = false, length = 100)
    private String idempotencyKey;

    @Column(name = "request_hash", nullable = false, length = 64)
    private String requestHash;

    @Column(name = "order_id", nullable = false)
    private UUID orderId;

    @JdbcTypeCode(SqlTypes.JSON)
    @Column(name = "response_body", nullable = false, columnDefinition = "jsonb")
    private String responseBody;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "expires_at", nullable = false)
    private LocalDateTime expiresAt;
}
