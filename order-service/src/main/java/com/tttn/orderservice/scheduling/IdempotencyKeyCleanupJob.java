package com.tttn.orderservice.scheduling;

import com.tttn.orderservice.repository.CheckoutIdempotencyKeyRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

/**
 * Deletes checkout {@code Idempotency-Key} rows past their 24h TTL, once per hour (AC4). An
 * expired row that is still present is already ignored by {@code CheckoutIdempotencyService};
 * this only keeps the table small.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class IdempotencyKeyCleanupJob {

    private final CheckoutIdempotencyKeyRepository checkoutIdempotencyKeyRepository;

    @Scheduled(cron = "0 0 * * * *")
    @Transactional
    public void deleteExpiredKeys() {
        int deleted = checkoutIdempotencyKeyRepository
                .deleteByExpiresAtBefore(LocalDateTime.now());

        if (deleted > 0) {
            log.info(
                    "IdempotencyKeyCleanupJob: đã xoá {} Idempotency-Key hết hạn",
                    deleted
            );
        }
    }
}
