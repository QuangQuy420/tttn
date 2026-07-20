package com.tttn.orderservice.client;

import com.tttn.orderservice.dto.response.PaymentCreationResponse;

import java.math.BigDecimal;
import java.util.UUID;

public interface PaymentClient {

    PaymentCreationResponse createPayment(
            UUID orderId,
            UUID userId,
            String orderCode,
            BigDecimal amount,
            String paymentMethod
    );
}