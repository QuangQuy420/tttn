package com.tttn.orderservice.client;

import com.tttn.orderservice.client.dto.PaymentServiceCreateRequest;
import com.tttn.orderservice.client.dto.PaymentServiceResponse;
import org.springframework.cloud.openfeign.FeignClient;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;

import java.util.UUID;

@FeignClient(
        name = "payment-service",
        url = "${services.payment.url}"
)
public interface PaymentFeignClient {

    @PostMapping("/api/v1/payments")
    PaymentServiceResponse createPayment(
            @RequestBody PaymentServiceCreateRequest request
    );

    @PatchMapping("/api/v1/payments/{paymentId}/cancel")
    PaymentServiceResponse cancelPayment(
            @PathVariable("paymentId") UUID paymentId
    );
}