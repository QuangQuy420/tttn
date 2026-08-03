package com.tttn.paymentservice.dto.request;

import com.tttn.paymentservice.entity.enums.PaymentStatus;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record UpdatePaymentStatusRequest(

        @NotNull(message = "Payment status is required")
        PaymentStatus status,

        @Size(
                max = 100,
                message = "Transaction ID must not exceed 100 characters"
        )
        String transactionId,

        @Size(
                max = 500,
                message = "Failure reason must not exceed 500 characters"
        )
        String failureReason
) {
}