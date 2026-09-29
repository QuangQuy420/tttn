package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.response.CheckoutResponse;
import com.tttn.orderservice.dto.response.IdempotentCheckoutResult;
import com.tttn.orderservice.entity.CheckoutIdempotencyKey;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.ConflictException;
import com.tttn.orderservice.repository.CheckoutIdempotencyKeyRepository;
import com.tttn.orderservice.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("CheckoutIdempotencyServiceImpl - checkout")
class CheckoutIdempotencyServiceImplTest {

    private static final String KEY = "7f1c2a9e-4b1d-4a53-9c1e-0d2f3b4a5c6d";

    @Mock
    private OrderService orderService;

    @Mock
    private CheckoutIdempotencyKeyRepository checkoutIdempotencyKeyRepository;

    private final JsonMapper jsonMapper = JsonMapper.builder().build();

    private CheckoutIdempotencyServiceImpl checkoutIdempotencyService;

    private UUID userId;
    private CheckoutRequest checkoutRequest;
    private CheckoutResponse checkoutResponse;

    @BeforeEach
    void setUp() {
        checkoutIdempotencyService = new CheckoutIdempotencyServiceImpl(
                orderService,
                checkoutIdempotencyKeyRepository,
                jsonMapper
        );

        userId = UUID.randomUUID();

        checkoutRequest = new CheckoutRequest(
                "Nguyễn Văn A",
                "0901234567",
                "123 Nguyễn Trãi, Quận 1, TP.HCM",
                "Giao hàng trong giờ hành chính",
                "VNPAY",
                List.of(UUID.randomUUID()),
                null
        );

        checkoutResponse = new CheckoutResponse(
                UUID.randomUUID(),
                "ORD-20260929-001",
                new BigDecimal("500000"),
                OrderStatus.PENDING,
                null,
                PaymentStatus.UNPAID,
                null
        );
    }

    @Test
    @DisplayName("Không có Idempotency-Key → checkout như cũ, không đọc bảng key")
    void checkout_WhenKeyIsNull_ShouldDelegateWithoutIdempotency() {
        when(orderService.checkout(userId, checkoutRequest, null, null))
                .thenReturn(checkoutResponse);

        IdempotentCheckoutResult result =
                checkoutIdempotencyService.checkout(userId, null, checkoutRequest);

        assertSame(checkoutResponse, result.response());
        assertFalse(result.replayed());

        verifyNoInteractions(checkoutIdempotencyKeyRepository);
    }

    @Test
    @DisplayName("Idempotency-Key dài hơn 100 ký tự → BadRequestException")
    void checkout_WhenKeyTooLong_ShouldThrowBadRequestException() {
        String tooLongKey = "k".repeat(101);

        assertThrows(
                BadRequestException.class,
                () -> checkoutIdempotencyService.checkout(
                        userId,
                        tooLongKey,
                        checkoutRequest
                )
        );

        verifyNoInteractions(orderService, checkoutIdempotencyKeyRepository);
    }

    @Test
    @DisplayName("Gửi lại cùng key và cùng body → trả lại đơn cũ, không tạo đơn mới")
    void checkout_WhenSameKeyAndSameBodySentTwice_ShouldReplayFirstOrder() {
        when(checkoutIdempotencyKeyRepository.findByUserIdAndIdempotencyKey(userId, KEY))
                .thenReturn(Optional.empty());
        when(orderService.checkout(eq(userId), eq(checkoutRequest), eq(KEY), anyString()))
                .thenReturn(checkoutResponse);

        IdempotentCheckoutResult first =
                checkoutIdempotencyService.checkout(userId, KEY, checkoutRequest);

        assertFalse(first.replayed());

        ArgumentCaptor<String> hashCaptor = ArgumentCaptor.forClass(String.class);
        verify(orderService).checkout(
                eq(userId),
                eq(checkoutRequest),
                eq(KEY),
                hashCaptor.capture()
        );
        String requestHash = hashCaptor.getValue();

        // SHA-256 hex, fits request_hash VARCHAR(64).
        assertTrue(requestHash.matches("[0-9a-f]{64}"));

        // The first checkout saved the key row (inside OrderService); the retry now finds it.
        when(checkoutIdempotencyKeyRepository.findByUserIdAndIdempotencyKey(userId, KEY))
                .thenReturn(Optional.of(storedKey(requestHash, LocalDateTime.now().plusHours(24))));

        IdempotentCheckoutResult second =
                checkoutIdempotencyService.checkout(userId, KEY, checkoutRequest);

        assertTrue(second.replayed());
        assertEquals(checkoutResponse, second.response());

        verify(orderService, times(1))
                .checkout(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Cùng key nhưng body khác → ConflictException (409)")
    void checkout_WhenSameKeyWithDifferentBody_ShouldThrowConflictException() {
        when(checkoutIdempotencyKeyRepository.findByUserIdAndIdempotencyKey(userId, KEY))
                .thenReturn(Optional.empty());
        when(orderService.checkout(eq(userId), eq(checkoutRequest), eq(KEY), anyString()))
                .thenReturn(checkoutResponse);

        checkoutIdempotencyService.checkout(userId, KEY, checkoutRequest);

        ArgumentCaptor<String> hashCaptor = ArgumentCaptor.forClass(String.class);
        verify(orderService).checkout(
                eq(userId),
                eq(checkoutRequest),
                eq(KEY),
                hashCaptor.capture()
        );

        when(checkoutIdempotencyKeyRepository.findByUserIdAndIdempotencyKey(userId, KEY))
                .thenReturn(Optional.of(
                        storedKey(hashCaptor.getValue(), LocalDateTime.now().plusHours(24))
                ));

        CheckoutRequest changedAddress = new CheckoutRequest(
                checkoutRequest.receiverName(),
                checkoutRequest.receiverPhone(),
                "456 Lê Lợi, Quận 1, TP.HCM",
                checkoutRequest.note(),
                checkoutRequest.paymentMethod(),
                checkoutRequest.variantIds(),
                checkoutRequest.expectedUnitPrices()
        );

        ConflictException exception = assertThrows(
                ConflictException.class,
                () -> checkoutIdempotencyService.checkout(userId, KEY, changedAddress)
        );

        assertEquals(
                "Idempotency-Key đã được dùng cho một yêu cầu khác",
                exception.getMessage()
        );

        verify(orderService, times(1))
                .checkout(any(), any(), any(), any());
    }

    @Test
    @DisplayName("Key đã hết hạn → xoá key cũ và tạo đơn mới")
    void checkout_WhenStoredKeyExpired_ShouldDeleteItAndCreateNewOrder() {
        CheckoutIdempotencyKey expired =
                storedKey("old-hash", LocalDateTime.now().minusMinutes(1));

        when(checkoutIdempotencyKeyRepository.findByUserIdAndIdempotencyKey(userId, KEY))
                .thenReturn(Optional.of(expired));
        when(orderService.checkout(eq(userId), eq(checkoutRequest), eq(KEY), anyString()))
                .thenReturn(checkoutResponse);

        IdempotentCheckoutResult result =
                checkoutIdempotencyService.checkout(userId, KEY, checkoutRequest);

        assertFalse(result.replayed());
        assertSame(checkoutResponse, result.response());

        verify(checkoutIdempotencyKeyRepository).delete(expired);
    }

    @Test
    @DisplayName("Thua request đồng thời (DataIntegrityViolationException) → trả lại đơn của request thắng")
    void checkout_WhenConcurrentRequestWonTheKey_ShouldReplayWinnerOrder() {
        CheckoutIdempotencyKey winner =
                storedKey(null, LocalDateTime.now().plusHours(24));

        when(checkoutIdempotencyKeyRepository.findByUserIdAndIdempotencyKey(userId, KEY))
                .thenReturn(Optional.empty())
                .thenReturn(Optional.of(winner));

        // The winner sent the same body, so it stored the same hash this request computed.
        when(orderService.checkout(eq(userId), eq(checkoutRequest), eq(KEY), anyString()))
                .thenAnswer(invocation -> {
                    winner.setRequestHash(invocation.getArgument(3));
                    throw new DataIntegrityViolationException("duplicate key");
                });

        IdempotentCheckoutResult result =
                checkoutIdempotencyService.checkout(userId, KEY, checkoutRequest);

        assertTrue(result.replayed());
        assertEquals(checkoutResponse.orderId(), result.response().orderId());

        verify(checkoutIdempotencyKeyRepository, times(2))
                .findByUserIdAndIdempotencyKey(userId, KEY);
    }

    private CheckoutIdempotencyKey storedKey(String requestHash, LocalDateTime expiresAt) {
        return CheckoutIdempotencyKey.builder()
                .userId(userId)
                .idempotencyKey(KEY)
                .requestHash(requestHash)
                .orderId(checkoutResponse.orderId())
                .responseBody(jsonMapper.writeValueAsString(checkoutResponse))
                .createdAt(expiresAt.minusHours(24))
                .expiresAt(expiresAt)
                .build();
    }
}
