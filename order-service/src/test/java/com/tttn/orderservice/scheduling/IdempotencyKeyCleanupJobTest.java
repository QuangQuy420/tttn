package com.tttn.orderservice.scheduling;

import com.tttn.orderservice.repository.CheckoutIdempotencyKeyRepository;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
@DisplayName("IdempotencyKeyCleanupJob - deleteExpiredKeys")
class IdempotencyKeyCleanupJobTest {

    @Mock
    private CheckoutIdempotencyKeyRepository checkoutIdempotencyKeyRepository;

    @Test
    @DisplayName("Xoá các Idempotency-Key đã hết hạn tính đến thời điểm hiện tại")
    void deleteExpiredKeys_ShouldDeleteKeysExpiredBeforeNow() {
        IdempotencyKeyCleanupJob job =
                new IdempotencyKeyCleanupJob(checkoutIdempotencyKeyRepository);

        LocalDateTime before = LocalDateTime.now();
        job.deleteExpiredKeys();
        LocalDateTime after = LocalDateTime.now();

        ArgumentCaptor<LocalDateTime> nowCaptor = ArgumentCaptor.forClass(LocalDateTime.class);
        verify(checkoutIdempotencyKeyRepository).deleteByExpiresAtBefore(nowCaptor.capture());

        assertFalse(nowCaptor.getValue().isBefore(before));
        assertFalse(nowCaptor.getValue().isAfter(after));
    }
}
