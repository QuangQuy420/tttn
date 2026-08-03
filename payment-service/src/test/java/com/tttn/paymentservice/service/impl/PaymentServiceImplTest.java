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
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PaymentServiceImplTest {

    @Mock
    private PaymentRepository paymentRepository;

    @Mock
    private PaymentMapper paymentMapper;

    @InjectMocks
    private PaymentServiceImpl paymentService;

    @Test
    void shouldCreatePaymentSuccessfully() {

        UUID orderId = UUID.randomUUID();
        UUID userId = UUID.randomUUID();

        CreatePaymentRequest request = new CreatePaymentRequest(
                orderId,
                userId,
                BigDecimal.valueOf(100000),
                PaymentMethod.COD
        );

        Payment payment = Payment.builder()
                .orderId(orderId)
                .userId(userId)
                .amount(BigDecimal.valueOf(100000))
                .paymentMethod(PaymentMethod.COD)
                .status(PaymentStatus.PENDING)
                .currency("VND")
                .build();

        PaymentResponse response = new PaymentResponse(
                UUID.randomUUID(),
                orderId,
                userId,
                BigDecimal.valueOf(100000),
                "VND",
                PaymentMethod.COD,
                PaymentStatus.PENDING,
                null,
                null,
                null,
                null,
                null,
                null
        );

        when(paymentRepository.existsByOrderId(orderId)).thenReturn(false);
        when(paymentMapper.toEntity(request)).thenReturn(payment);
        when(paymentRepository.save(payment)).thenReturn(payment);
        when(paymentMapper.toResponse(payment)).thenReturn(response);

        PaymentResponse result = paymentService.createPayment(request);

        assertNotNull(result);
        assertEquals(PaymentStatus.PENDING, result.status());

        verify(paymentRepository).save(payment);
    }

    @Test
    void shouldThrowExceptionWhenOrderAlreadyExists() {

        UUID orderId = UUID.randomUUID();

        CreatePaymentRequest request = new CreatePaymentRequest(
                orderId,
                UUID.randomUUID(),
                BigDecimal.valueOf(1000),
                PaymentMethod.COD
        );

        when(paymentRepository.existsByOrderId(orderId))
                .thenReturn(true);

        assertThrows(
                BadRequestException.class,
                () -> paymentService.createPayment(request)
        );

        verify(paymentRepository, never()).save(any());
    }

    @Test
    void shouldReturnPaymentById() {

        UUID paymentId = UUID.randomUUID();

        Payment payment = Payment.builder()
                .id(paymentId)
                .build();

        PaymentResponse response = mock(PaymentResponse.class);

        when(paymentRepository.findById(paymentId))
                .thenReturn(Optional.of(payment));

        when(paymentMapper.toResponse(payment))
                .thenReturn(response);

        assertEquals(
                response,
                paymentService.getPayment(paymentId)
        );
    }

    @Test
    void shouldThrowWhenPaymentNotFound() {

        UUID id = UUID.randomUUID();

        when(paymentRepository.findById(id))
                .thenReturn(Optional.empty());

        assertThrows(
                ResourceNotFoundException.class,
                () -> paymentService.getPayment(id)
        );
    }

    @Test
    void shouldCancelPayment() {

        UUID paymentId = UUID.randomUUID();

        Payment payment = Payment.builder()
                .id(paymentId)
                .status(PaymentStatus.PENDING)
                .build();

        PaymentResponse response = mock(PaymentResponse.class);

        when(paymentRepository.findById(paymentId))
                .thenReturn(Optional.of(payment));

        when(paymentRepository.save(payment))
                .thenReturn(payment);

        when(paymentMapper.toResponse(payment))
                .thenReturn(response);

        paymentService.cancelPayment(paymentId);

        assertEquals(
                PaymentStatus.CANCELLED,
                payment.getStatus()
        );
    }
}