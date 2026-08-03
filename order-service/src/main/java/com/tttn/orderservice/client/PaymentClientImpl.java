package com.tttn.orderservice.client;

import com.tttn.orderservice.client.dto.PaymentServiceCreateRequest;
import com.tttn.orderservice.client.dto.PaymentServiceResponse;
import com.tttn.orderservice.dto.response.PaymentCreationResponse;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.exception.ExternalServiceException;
import feign.FeignException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.UUID;

@Component
@RequiredArgsConstructor
public class PaymentClientImpl implements PaymentClient {

    private final PaymentFeignClient paymentFeignClient;

    @Override
    public PaymentCreationResponse createPayment(
            UUID orderId,
            UUID userId,
            String orderCode,
            BigDecimal amount,
            String paymentMethod
    ) {
        try {
            PaymentServiceResponse response =
                    paymentFeignClient.createPayment(
                            new PaymentServiceCreateRequest(
                                    orderId,
                                    userId,
                                    amount,
                                    paymentMethod
                            )
                    );

            if (response == null) {
                throw new ExternalServiceException(
                        "Payment Service trả về dữ liệu rỗng"
                );
            }

            return mapToPaymentCreationResponse(response);

        } catch (FeignException exception) {
            throw new ExternalServiceException(
                    "Không thể tạo thanh toán. Payment Service trả về HTTP "
                            + exception.status()
            );
        } catch (ExternalServiceException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ExternalServiceException(
                    "Không thể tạo thanh toán: "
                            + exception.getMessage()
            );
        }
    }

    @Override
    public PaymentCreationResponse cancelPayment(UUID paymentId) {
        try {
            PaymentServiceResponse response =
                    paymentFeignClient.cancelPayment(paymentId);

            if (response == null) {
                throw new ExternalServiceException(
                        "Payment Service trả về dữ liệu rỗng"
                );
            }

            return mapToPaymentCreationResponse(response);

        } catch (FeignException exception) {
            throw new ExternalServiceException(
                    "Không thể hủy thanh toán. Payment Service trả về HTTP "
                            + exception.status()
            );
        } catch (ExternalServiceException exception) {
            throw exception;
        } catch (Exception exception) {
            throw new ExternalServiceException(
                    "Không thể hủy thanh toán: "
                            + exception.getMessage()
            );
        }
    }

    private PaymentCreationResponse mapToPaymentCreationResponse(
            PaymentServiceResponse response
    ) {
        return new PaymentCreationResponse(
                response.id(),
                response.orderId(),
                mapPaymentStatus(response.status()),
                response.paymentUrl(),
                response.transactionId()
        );
    }

    private PaymentStatus mapPaymentStatus(String status) {
        if (status == null || status.isBlank()) {
            return PaymentStatus.UNPAID;
        }

        try {
            return PaymentStatus.valueOf(status.toUpperCase());
        } catch (IllegalArgumentException exception) {
            throw new ExternalServiceException(
                    "Payment Service trả về trạng thái không hợp lệ: "
                            + status
            );
        }
    }
}