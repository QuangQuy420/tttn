package com.tttn.paymentservice.service.impl;

import com.tttn.paymentservice.dto.request.CreatePaymentRequest;
import com.tttn.paymentservice.dto.response.PaymentResponse;
import com.tttn.paymentservice.entity.Payment;
import com.tttn.paymentservice.entity.enums.PaymentMethod;
import com.tttn.paymentservice.entity.enums.PaymentStatus;
import com.tttn.paymentservice.exception.BadRequestException;
import com.tttn.paymentservice.exception.ResourceNotFoundException;
import com.tttn.paymentservice.mapper.PaymentMapper;
import com.tttn.paymentservice.repository.PaymentRepository;
import com.tttn.paymentservice.service.PaymentService;
import com.tttn.paymentservice.service.VnPayService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class PaymentServiceImpl implements PaymentService {

    private final PaymentRepository paymentRepository;
    private final PaymentMapper paymentMapper;
    private final VnPayService vnPayService;

    @Override
    @Transactional
    public PaymentResponse createPayment(
            CreatePaymentRequest request
    ) {
        return createPayment(
                request,
                "127.0.0.1"
        );
    }

    @Override
    @Transactional
    public PaymentResponse createPayment(
            CreatePaymentRequest request,
            String clientIp
    ) {
        if (paymentRepository.existsByOrderId(request.orderId())) {
            throw new BadRequestException(
                    "Payment already exists for order: "
                            + request.orderId()
            );
        }

        Payment payment = paymentMapper.toEntity(request);

        Payment savedPayment =
                paymentRepository.save(payment);

        if (savedPayment.getPaymentMethod() == PaymentMethod.VNPAY) {
            String paymentUrl =
                    vnPayService.createPaymentUrl(
                            savedPayment,
                            clientIp
                    );

            savedPayment.setPaymentUrl(paymentUrl);

            /*
             * Trước khi VNPay trả mã giao dịch chính thức,
             * transactionId tạm lưu Payment UUID.
             */
            savedPayment.setTransactionId(
                    savedPayment.getId().toString()
            );

            savedPayment =
                    paymentRepository.save(savedPayment);

            log.info(
                    "Created VNPay payment URL for paymentId={}, orderId={}",
                    savedPayment.getId(),
                    savedPayment.getOrderId()
            );
        } else {

            log.info(
                    "Created payment paymentId={}, orderId={}, method={}",
                    savedPayment.getId(),
                    savedPayment.getOrderId(),
                    savedPayment.getPaymentMethod()
            );
        }

        return paymentMapper.toResponse(savedPayment);
    }

    @Override
    public PaymentResponse getPayment(UUID paymentId) {
        Payment payment = findPaymentById(paymentId);

        return paymentMapper.toResponse(payment);
    }

    @Override
    public PaymentResponse getPaymentByOrderId(UUID orderId) {
        Payment payment =
                paymentRepository.findByOrderId(orderId)
                        .orElseThrow(() ->
                                new ResourceNotFoundException(
                                        "Payment not found for order: "
                                                + orderId
                                )
                        );

        return paymentMapper.toResponse(payment);
    }

    @Override
    @Transactional
    public PaymentResponse cancelPayment(UUID paymentId) {
        Payment payment = findPaymentById(paymentId);

        if (payment.getStatus() == PaymentStatus.SUCCESS) {
            throw new BadRequestException(
                    "Successful payment cannot be cancelled"
            );
        }

        if (payment.getStatus() == PaymentStatus.REFUNDED) {
            throw new BadRequestException(
                    "Refunded payment cannot be cancelled"
            );
        }

        if (payment.getStatus() == PaymentStatus.CANCELLED) {
            return paymentMapper.toResponse(payment);
        }

        payment.setStatus(PaymentStatus.CANCELLED);
        payment.setPaymentUrl(null);
        payment.setFailureReason("Payment cancelled");

        Payment updatedPayment =
                paymentRepository.save(payment);

        log.info(
                "Cancelled payment paymentId={}, orderId={}",
                updatedPayment.getId(),
                updatedPayment.getOrderId()
        );

        return paymentMapper.toResponse(updatedPayment);
    }

    @Override
    @Transactional(readOnly = true)
    public PaymentResponse processVnPayReturn(
            Map<String, String> parameters
    ) {
        if (!vnPayService.verifyCallback(parameters)) {
            throw new BadRequestException(
                    "Chữ ký VNPay không hợp lệ"
            );
        }

        Payment payment =
                findPaymentByTransactionReference(
                        parameters.get("vnp_TxnRef")
                );

        validateVnPayAmount(
                payment,
                parameters
        );

        /*
         * Return URL chỉ xác minh dữ liệu và trả trạng thái hiện có.
         * Việc cập nhật chính thức thực hiện tại IPN.
         */
        log.info(
                "Processed VNPay return for paymentId={}, responseCode={}, transactionStatus={}",
                payment.getId(),
                parameters.get("vnp_ResponseCode"),
                parameters.get("vnp_TransactionStatus")
        );

        return paymentMapper.toResponse(payment);
    }

    @Override
    @Transactional
    public Map<String, String> processVnPayIpn(
            Map<String, String> parameters
    ) {
        try {
            if (!vnPayService.verifyCallback(parameters)) {
                log.warn(
                        "Rejected VNPay IPN because signature is invalid"
                );

                return Map.of(
                        "RspCode", "97",
                        "Message", "Invalid Signature"
                );
            }

            Payment payment;

            try {
                payment =
                        findPaymentByTransactionReference(
                                parameters.get("vnp_TxnRef")
                        );
            } catch (
                    ResourceNotFoundException
                    | BadRequestException exception
            ) {
                log.warn(
                        "VNPay IPN payment not found for txnRef={}",
                        parameters.get("vnp_TxnRef")
                );

                return Map.of(
                        "RspCode", "01",
                        "Message", "Order not found"
                );
            }

            try {
                validateVnPayAmount(
                        payment,
                        parameters
                );
            } catch (BadRequestException exception) {
                log.warn(
                        "VNPay IPN amount mismatch for paymentId={}",
                        payment.getId()
                );

                return Map.of(
                        "RspCode", "04",
                        "Message", "Invalid Amount"
                );
            }

            if (isFinalStatus(payment.getStatus())) {
                log.info(
                        "VNPay IPN ignored because payment is already finalized: paymentId={}, status={}",
                        payment.getId(),
                        payment.getStatus()
                );

                return Map.of(
                        "RspCode", "02",
                        "Message", "Order already confirmed"
                );
            }

            updatePaymentFromVnPay(
                    payment,
                    parameters
            );

            Payment updatedPayment =
                    paymentRepository.save(payment);

            log.info(
                    "VNPay IPN processed successfully: paymentId={}, orderId={}, status={}, transactionId={}",
                    updatedPayment.getId(),
                    updatedPayment.getOrderId(),
                    updatedPayment.getStatus(),
                    updatedPayment.getTransactionId()
            );

            return Map.of(
                    "RspCode", "00",
                    "Message", "Confirm Success"
            );

        } catch (Exception exception) {
            log.error(
                    "Unexpected error while processing VNPay IPN",
                    exception
            );

            return Map.of(
                    "RspCode", "99",
                    "Message", "Unknown error"
            );
        }
    }

    private Payment findPaymentByTransactionReference(
            String transactionReference
    ) {
        if (transactionReference == null
                || transactionReference.isBlank()) {
            throw new BadRequestException(
                    "Thiếu vnp_TxnRef"
            );
        }

        UUID paymentId;

        try {
            paymentId =
                    UUID.fromString(transactionReference);
        } catch (IllegalArgumentException exception) {
            throw new BadRequestException(
                    "vnp_TxnRef không hợp lệ"
            );
        }

        return findPaymentById(paymentId);
    }

    private void validateVnPayAmount(
            Payment payment,
            Map<String, String> parameters
    ) {
        String vnpAmount =
                parameters.get("vnp_Amount");

        if (vnpAmount == null || vnpAmount.isBlank()) {
            throw new BadRequestException(
                    "Thiếu số tiền VNPay"
            );
        }

        BigDecimal receivedAmount;

        try {
            receivedAmount =
                    new BigDecimal(vnpAmount)
                            .divide(BigDecimal.valueOf(100));
        } catch (
                NumberFormatException
                | ArithmeticException exception
        ) {
            throw new BadRequestException(
                    "Số tiền VNPay không hợp lệ"
            );
        }

        if (payment.getAmount()
                .compareTo(receivedAmount) != 0) {
            throw new BadRequestException(
                    "Số tiền thanh toán không khớp"
            );
        }
    }

    private void updatePaymentFromVnPay(
            Payment payment,
            Map<String, String> parameters
    ) {
        String responseCode =
                parameters.get("vnp_ResponseCode");

        String transactionStatus =
                parameters.get("vnp_TransactionStatus");

        boolean successful =
                "00".equals(responseCode)
                        && "00".equals(transactionStatus);

        if (successful) {
            payment.setStatus(PaymentStatus.SUCCESS);
            payment.setPaidAt(Instant.now());
            payment.setFailureReason(null);
        } else {
            payment.setStatus(PaymentStatus.FAILED);
            payment.setPaidAt(null);
            payment.setFailureReason(
                    "VNPay responseCode="
                            + responseCode
                            + ", transactionStatus="
                            + transactionStatus
            );
        }

        String transactionNo =
                parameters.get("vnp_TransactionNo");

        if (transactionNo != null
                && !transactionNo.isBlank()) {
            payment.setTransactionId(transactionNo);
        }

        payment.setPaymentUrl(null);
    }

    private boolean isFinalStatus(
            PaymentStatus status
    ) {
        return status == PaymentStatus.SUCCESS
                || status == PaymentStatus.FAILED
                || status == PaymentStatus.CANCELLED
                || status == PaymentStatus.REFUNDED;
    }

    private Payment findPaymentById(UUID paymentId) {
        return paymentRepository.findById(paymentId)
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Payment not found: "
                                        + paymentId
                        )
                );
    }
}