package com.tttn.paymentservice.mapper;

import com.tttn.paymentservice.dto.request.CreatePaymentRequest;
import com.tttn.paymentservice.dto.response.PaymentResponse;
import com.tttn.paymentservice.entity.Payment;
import com.tttn.paymentservice.entity.enums.PaymentStatus;
import org.springframework.stereotype.Component;

@Component
public class PaymentMapper {

    public Payment toEntity(CreatePaymentRequest request) {
        if (request == null) {
            return null;
        }

        return Payment.builder()
                .orderId(request.orderId())
                .userId(request.userId())
                .amount(request.amount())
                .currency("VND")
                .paymentMethod(request.paymentMethod())
                .status(PaymentStatus.PENDING)
                .build();
    }

    public PaymentResponse toResponse(Payment payment) {
        if (payment == null) {
            return null;
        }

        return new PaymentResponse(
                payment.getId(),
                payment.getOrderId(),
                payment.getUserId(),
                payment.getAmount(),
                payment.getCurrency(),
                payment.getPaymentMethod(),
                payment.getStatus(),
                payment.getTransactionId(),
                payment.getPaymentUrl(),
                payment.getFailureReason(),
                payment.getPaidAt(),
                payment.getCreatedAt(),
                payment.getUpdatedAt()
        );
    }
}