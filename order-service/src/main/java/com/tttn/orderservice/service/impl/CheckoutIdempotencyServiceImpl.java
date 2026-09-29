package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.response.CheckoutResponse;
import com.tttn.orderservice.dto.response.IdempotentCheckoutResult;
import com.tttn.orderservice.entity.CheckoutIdempotencyKey;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.ConflictException;
import com.tttn.orderservice.repository.CheckoutIdempotencyKeyRepository;
import com.tttn.orderservice.service.CheckoutIdempotencyService;
import com.tttn.orderservice.service.OrderService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;

/**
 * Idempotency-Key handling for checkout (Postgres-backed, see ADR 0003). Deliberately NOT
 * {@code @Transactional}: the order transaction lives only in {@link OrderService#checkout}, so
 * when a concurrent duplicate loses on the UNIQUE index its rollback does not affect the re-read
 * below, which then replays the winner's response.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CheckoutIdempotencyServiceImpl implements CheckoutIdempotencyService {

    private static final int MAX_KEY_LENGTH = 100;

    private final OrderService orderService;
    private final CheckoutIdempotencyKeyRepository checkoutIdempotencyKeyRepository;
    private final JsonMapper jsonMapper;

    @Override
    public IdempotentCheckoutResult checkout(
            UUID userId,
            String idempotencyKey,
            CheckoutRequest request
    ) {
        if (idempotencyKey == null || idempotencyKey.isBlank()) {
            log.warn(
                    "Checkout của người dùng {} không có header Idempotency-Key, gửi lại có thể tạo đơn trùng",
                    userId
            );

            return new IdempotentCheckoutResult(
                    orderService.checkout(userId, request, null, null),
                    false
            );
        }

        if (idempotencyKey.length() > MAX_KEY_LENGTH) {
            throw new BadRequestException(
                    "Idempotency-Key tối đa " + MAX_KEY_LENGTH + " ký tự"
            );
        }

        String requestHash = hash(request);

        Optional<CheckoutIdempotencyKey> existing = checkoutIdempotencyKeyRepository
                .findByUserIdAndIdempotencyKey(userId, idempotencyKey);

        if (existing.isPresent()) {
            CheckoutIdempotencyKey key = existing.get();

            if (key.getExpiresAt().isAfter(LocalDateTime.now())) {
                return replay(key, requestHash);
            }

            // Expired but not cleaned up yet: remove it (own short transaction) so the new
            // insert does not hit the UNIQUE index.
            checkoutIdempotencyKeyRepository.delete(key);
        }

        try {
            CheckoutResponse response = orderService.checkout(
                    userId,
                    request,
                    idempotencyKey,
                    requestHash
            );

            return new IdempotentCheckoutResult(response, false);
        } catch (DataIntegrityViolationException exception) {
            // Lost the race against a concurrent request with the same key: its order committed,
            // ours rolled back. Replay the winner's response.
            CheckoutIdempotencyKey winner = checkoutIdempotencyKeyRepository
                    .findByUserIdAndIdempotencyKey(userId, idempotencyKey)
                    .orElseThrow(() -> exception);

            return replay(winner, requestHash);
        }
    }

    private IdempotentCheckoutResult replay(
            CheckoutIdempotencyKey key,
            String requestHash
    ) {
        if (!key.getRequestHash().equals(requestHash)) {
            throw new ConflictException(
                    "Idempotency-Key đã được dùng cho một yêu cầu khác"
            );
        }

        log.info(
                "Trả lại kết quả checkout đã lưu cho Idempotency-Key của người dùng {} (đơn hàng {})",
                key.getUserId(),
                key.getOrderId()
        );

        CheckoutResponse response = jsonMapper.readValue(
                key.getResponseBody(),
                CheckoutResponse.class
        );

        return new IdempotentCheckoutResult(response, true);
    }

    /**
     * SHA-256 (hex) of a canonical JSON form of the WHOLE request, so any field change is
     * detected: variantIds sorted, expectedUnitPrices keys sorted, prices as plain strings
     * without trailing zeros, blank note = null, empty expectedUnitPrices = null.
     */
    private String hash(CheckoutRequest request) {
        List<String> variantIds = request.variantIds() == null
                ? List.of()
                : request.variantIds().stream()
                        .map(String::valueOf)
                        .sorted()
                        .toList();

        Map<String, String> expectedUnitPrices = null;
        if (request.expectedUnitPrices() != null
                && !request.expectedUnitPrices().isEmpty()) {
            expectedUnitPrices = new TreeMap<>();
            for (Map.Entry<UUID, BigDecimal> entry
                    : request.expectedUnitPrices().entrySet()) {
                expectedUnitPrices.put(
                        String.valueOf(entry.getKey()),
                        entry.getValue() == null
                                ? null
                                : entry.getValue().stripTrailingZeros().toPlainString()
                );
            }
        }

        String note = request.note() == null || request.note().isBlank()
                ? null
                : request.note();

        Map<String, Object> canonical = new LinkedHashMap<>();
        canonical.put("receiverName", request.receiverName());
        canonical.put("receiverPhone", request.receiverPhone());
        canonical.put("shippingAddress", request.shippingAddress());
        canonical.put("note", note);
        canonical.put("paymentMethod", request.paymentMethod());
        canonical.put("variantIds", variantIds);
        canonical.put("expectedUnitPrices", expectedUnitPrices);

        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(
                    jsonMapper.writeValueAsString(canonical)
                            .getBytes(StandardCharsets.UTF_8)
            );

            return HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException exception) {
            // Every JVM must support SHA-256.
            throw new IllegalStateException(exception);
        }
    }
}
