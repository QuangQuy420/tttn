package com.tttn.paymentservice.service;

import com.tttn.paymentservice.entity.Payment;

import java.util.Map;

public interface VnPayService {

    String createPaymentUrl(
            Payment payment,
            String clientIp
    );

    boolean verifyCallback(
            Map<String, String> parameters
    );
}