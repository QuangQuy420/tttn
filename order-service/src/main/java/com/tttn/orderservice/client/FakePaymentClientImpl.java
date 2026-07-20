package com.tttn.orderservice.client;

import com.tttn.orderservice.dto.response.PaymentCreationResponse;
import com.tttn.orderservice.enums.PaymentStatus;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.UUID;

/**
 * TEMPORARY stand-in for {@code payment-service}, which doesn't exist yet as a real service.
 * Immediately "approves" every payment instead of calling out over HTTP, so checkout can be
 * exercised end-to-end today. Controlled by the {@code payment.fake-enabled} property — remove
 * or disable this class (and flip the property to {@code false}) once {@code payment-service}
 * is real and {@link PaymentClientImpl} should take over.
 */
@Component
@ConditionalOnProperty(name = "payment.fake-enabled", havingValue = "true", matchIfMissing = true)
public class FakePaymentClientImpl implements PaymentClient {

    @Override
    public PaymentCreationResponse createPayment(
            UUID orderId,
            UUID userId,
            String orderCode,
            BigDecimal amount,
            String paymentMethod
    ) {
        return new PaymentCreationResponse(
                UUID.randomUUID(),
                orderId,
                PaymentStatus.PAID,
                null,
                "FAKE-" + UUID.randomUUID()
        );
    }
}
