package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.SagaChaosMode;
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

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.same;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderSagaEventListener - enqueue sự kiện PURCHASE khi payment.completed")
class OrderSagaEventListenerPurchaseTest {

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
    private OrderSagaReplyEvent event;

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
        event = new OrderSagaReplyEvent(
                orderId,
                LocalDateTime.now(),
                null,
                UUID.randomUUID(),
                "TXN-001"
        );
    }

    @Test
    @DisplayName("Đơn AWAITING_PAYMENT có 2 sản phẩm → enqueuePurchase được gọi 2 lần")
    void handle_PaymentCompletedForAwaitingPaymentOrder_ShouldEnqueuePurchasePerItem() {
        Order order = buildOrder(OrderStatus.AWAITING_PAYMENT);
        OrderItem first = buildItem();
        OrderItem second = buildItem();
        order.addItem(first);
        order.addItem(second);

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        listener.handle(event, OrderSagaRoutingKeys.PAYMENT_COMPLETED);

        verify(behaviorEventPublisher, times(2)).enqueuePurchase(any(Order.class), any(OrderItem.class));
        verify(behaviorEventPublisher).enqueuePurchase(same(order), same(first));
        verify(behaviorEventPublisher).enqueuePurchase(same(order), same(second));
    }

    @Test
    @DisplayName("Đơn không ở AWAITING_PAYMENT (redelivery) → không enqueue PURCHASE")
    void handle_PaymentCompletedForNonAwaitingPaymentOrder_ShouldNotEnqueuePurchase() {
        Order order = buildOrder(OrderStatus.CONFIRMED);
        order.addItem(buildItem());
        order.addItem(buildItem());

        when(orderRepository.findById(orderId)).thenReturn(Optional.of(order));

        listener.handle(event, OrderSagaRoutingKeys.PAYMENT_COMPLETED);

        verify(behaviorEventPublisher, never()).enqueuePurchase(any(), any());
    }

    private Order buildOrder(OrderStatus status) {
        return Order.builder()
                .id(orderId)
                .userId(UUID.randomUUID())
                .status(status)
                .build();
    }

    private OrderItem buildItem() {
        return OrderItem.builder()
                .productId(UUID.randomUUID())
                .variantId(UUID.randomUUID())
                .quantity(1)
                .build();
    }
}
