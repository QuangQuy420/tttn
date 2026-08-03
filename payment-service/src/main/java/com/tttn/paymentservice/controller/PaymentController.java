package com.tttn.paymentservice.controller;

import com.tttn.paymentservice.dto.request.CreatePaymentRequest;
import com.tttn.paymentservice.dto.response.PaymentResponse;
import com.tttn.paymentservice.service.PaymentService;
import com.tttn.paymentservice.util.VnPayUtils;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/payments")
@RequiredArgsConstructor
public class PaymentController {

    private final PaymentService paymentService;

    @PostMapping
    public ResponseEntity<PaymentResponse> createPayment(
            @Valid @RequestBody CreatePaymentRequest request,
            HttpServletRequest httpRequest
    ) {
        String clientIp =
                VnPayUtils.getClientIp(httpRequest);

        PaymentResponse response =
                paymentService.createPayment(
                        request,
                        clientIp
                );

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(response);
    }

    @GetMapping("/{paymentId}")
    public ResponseEntity<PaymentResponse> getPayment(
            @PathVariable UUID paymentId
    ) {
        return ResponseEntity.ok(
                paymentService.getPayment(paymentId)
        );
    }

    @GetMapping("/order/{orderId}")
    public ResponseEntity<PaymentResponse> getPaymentByOrderId(
            @PathVariable UUID orderId
    ) {
        return ResponseEntity.ok(
                paymentService.getPaymentByOrderId(orderId)
        );
    }

    @PatchMapping("/{paymentId}/cancel")
    public ResponseEntity<PaymentResponse> cancelPayment(
            @PathVariable UUID paymentId
    ) {
        return ResponseEntity.ok(
                paymentService.cancelPayment(paymentId)
        );
    }

    @GetMapping("/vnpay/return")
    public ResponseEntity<PaymentResponse> vnPayReturn(
            @RequestParam Map<String, String> parameters
    ) {
        return ResponseEntity.ok(
                paymentService.processVnPayReturn(parameters)
        );
    }

    @GetMapping("/vnpay/ipn")
    public ResponseEntity<Map<String, String>> vnPayIpn(
            @RequestParam Map<String, String> parameters
    ) {
        return ResponseEntity.ok(
                paymentService.processVnPayIpn(parameters)
        );
    }
}