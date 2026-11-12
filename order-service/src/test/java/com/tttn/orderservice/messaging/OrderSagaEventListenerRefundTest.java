package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.enums.SagaChaosMode;
import com.tttn.orderservice.enums.SagaLogStage;
import com.tttn.orderservice.messaging.event.OrderSagaReplyEvent;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.CartService;
import com.tttn.orderservice.service.OrderSagaLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderSagaEventListener - hoàn tiền (payment.refunded, payment.completed đến muộn)")
class OrderSagaEventListenerRefundTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderSagaEventPublisher orderSagaEventPublisher;

    @Mock
    private CartService cartService;

    @Mock
    private OrderSagaLogService orderSagaLogService;

    @Mock
    private BehaviorEventPublisher behaviorEventPublisher;

    private OrderSagaEventListener listener;

    private UUID orderId;
    private UUID paymentId;

    @BeforeEach
    void setUp() {
        listener = new OrderSagaEventListener(
                orderRepository,
                orderSagaEventPublisher,
                cartService,
                orderSagaLogService,
                behaviorEventPublisher
        );
        ReflectionTestUtils.setField(listener, "chaosMode", SagaChaosMode.NONE);

        orderId = UUID.randomUUID();
        paymentId = UUID.randomUUID();
    }

    @Test
    @DisplayName("payment.refunded cho đơn đã hủy và đã thanh toán → paymentStatus = REFUNDED (AC32)")
    void handle_PaymentRefundedForPaidOrder_ShouldMarkRefunded() {
        Order order = buildOrder(OrderStatus.CANCELLED, PaymentStatus.PAID);

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        listener.handle(replyEvent(null), OrderSagaRoutingKeys.PAYMENT_REFUNDED);

        assertEquals(PaymentStatus.REFUNDED, order.getPaymentStatus());
        assertEquals(OrderStatus.CANCELLED, order.getStatus());

        verify(orderRepository).save(order);
        verify(orderSagaLogService).log(
                same(order),
                eq(SagaLogStage.PAYMENT_REFUNDED),
                any(),
                anyString(),
                any(),
                any(),
                any(),
                any()
        );
    }

    @Test
    @DisplayName("payment.refunded lặp lại cho đơn đã REFUNDED → không lưu lại, không ghi log (AC32)")
    void handle_PaymentRefundedTwice_ShouldBeNoOp() {
        Order order = buildOrder(OrderStatus.CANCELLED, PaymentStatus.REFUNDED);

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        listener.handle(replyEvent(null), OrderSagaRoutingKeys.PAYMENT_REFUNDED);

        assertEquals(PaymentStatus.REFUNDED, order.getPaymentStatus());
        verify(orderRepository, never()).save(any(Order.class));
        verifyNoInteractions(orderSagaLogService, orderSagaEventPublisher);
    }

    @Test
    @DisplayName("payment.completed đến sau khi đơn đã hủy → ghi nhận PAID, gửi hoàn tiền + hoàn kho (AC35)")
    void handle_LatePaymentCompletedForCancelledOrder_ShouldRequestRefundAndRestock() {
        Order order = buildOrder(OrderStatus.CANCELLED, PaymentStatus.UNPAID);

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        listener.handle(replyEvent("TXN-LATE-001"), OrderSagaRoutingKeys.PAYMENT_COMPLETED);

        // The order stays cancelled; the money taken is recorded so it can be refunded.
        assertEquals(OrderStatus.CANCELLED, order.getStatus());
        assertEquals(PaymentStatus.PAID, order.getPaymentStatus());
        assertEquals(paymentId, order.getPaymentId());
        assertEquals("TXN-LATE-001", order.getTransactionCode());

        verify(orderRepository).save(order);
        verify(orderSagaEventPublisher)
                .publishPaymentRefundRequested(eq(orderId), anyString());
        verify(orderSagaEventPublisher)
                .publishStockRestockRequested(orderId);
        verifyNoInteractions(cartService, behaviorEventPublisher);
    }

    @Test
    @DisplayName("payment.completed lặp lại cho đơn đã hủy và đã PAID → không gửi hoàn tiền lần nữa (AC35)")
    void handle_LatePaymentCompletedRedelivered_ShouldNotRequestRefundAgain() {
        Order order = buildOrder(OrderStatus.CANCELLED, PaymentStatus.PAID);

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        listener.handle(replyEvent("TXN-LATE-001"), OrderSagaRoutingKeys.PAYMENT_COMPLETED);

        verify(orderRepository, never()).save(any(Order.class));
        verifyNoInteractions(orderSagaEventPublisher);
    }

    private OrderSagaReplyEvent replyEvent(String transactionCode) {
        return new OrderSagaReplyEvent(
                orderId,
                LocalDateTime.now(),
                null,
                paymentId,
                transactionCode
        );
    }

    private Order buildOrder(OrderStatus status, PaymentStatus paymentStatus) {
        return Order.builder()
                .id(orderId)
                .userId(UUID.randomUUID())
                .status(status)
                .paymentStatus(paymentStatus)
                .build();
    }
}
