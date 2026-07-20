package com.tttn.orderservice.client;

import com.tttn.orderservice.dto.request.CreatePaymentRequest;
import com.tttn.orderservice.dto.response.PaymentCreationResponse;
import com.tttn.orderservice.exception.ExternalServiceException;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.util.UUID;
import org.springframework.stereotype.Component;
@Component
@ConditionalOnProperty(name = "payment.fake-enabled", havingValue = "false")
@RequiredArgsConstructor
public class PaymentClientImpl implements PaymentClient {

    private final RestClient paymentRestClient;

    @Override
    public PaymentCreationResponse createPayment(
            UUID orderId,
            UUID userId,
            String orderCode,
            BigDecimal amount,
            String paymentMethod
    ) {
        try {
            PaymentCreationResponse response = paymentRestClient
                    .post()
                    .uri("/api/v1/payments")
                    .body(new CreatePaymentRequest(
                            orderId,
                            userId,
                            orderCode,
                            amount,
                            paymentMethod
                    ))
                    .retrieve()
                    .body(PaymentCreationResponse.class);

            if (response == null) {
                throw new ExternalServiceException(
                        "Payment Service trả về dữ liệu rỗng"
                );
            }

            return response;
        } catch (Exception exception) {
            throw new ExternalServiceException(
                    "Không thể tạo thanh toán: "
                            + exception.getMessage()
            );
        }
    }
}