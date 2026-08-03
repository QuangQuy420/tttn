package com.tttn.paymentservice.service;

import com.tttn.paymentservice.dto.request.CreatePaymentRequest;
import com.tttn.paymentservice.dto.response.PaymentResponse;

import java.util.Map;
import java.util.UUID;

public interface PaymentService {

    PaymentResponse createPayment(
            CreatePaymentRequest request
    );

    PaymentResponse createPayment(
            CreatePaymentRequest request,
            String clientIp
    );

    PaymentResponse getPayment(UUID paymentId);

    PaymentResponse getPaymentByOrderId(UUID orderId);

    PaymentResponse cancelPayment(UUID paymentId);

    PaymentResponse processVnPayReturn(
            Map<String, String> parameters
    );

    Map<String, String> processVnPayIpn(
            Map<String, String> parameters
    );
}