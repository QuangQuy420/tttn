package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.entity.OutboxEvent;
import com.tttn.orderservice.enums.SagaChaosMode;
import com.tttn.orderservice.messaging.event.PaymentCreateRequestedEvent;
import com.tttn.orderservice.messaging.event.StockItemsEvent;
import com.tttn.orderservice.service.OutboxService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderSagaEventPublisher - enqueue qua outbox")
class OrderSagaEventPublisherTest {

    @Mock
    private OutboxService outboxService;

    private OrderSagaEventPublisher publisher;

    private UUID orderId;
    private UUID variantId;
    private List<OrderItem> items;

    @BeforeEach
    void setUp() {
        publisher = new OrderSagaEventPublisher(outboxService);
        ReflectionTestUtils.setField(publisher, "chaosMode", SagaChaosMode.NONE);

        orderId = UUID.randomUUID();
        variantId = UUID.randomUUID();
        items = List.of(
                OrderItem.builder()
                        .variantId(variantId)
                        .quantity(2)
                        .build()
        );
    }

    @Test
    @DisplayName("stock.reserve.requested được ghi vào outbox, không gửi thẳng RabbitMQ")
    void publishStockReserveRequested_ShouldEnqueueOutboxRow() {
        publisher.publishStockReserveRequested(orderId, items);

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(outboxService).enqueue(
                eq(OrderSagaRoutingKeys.EXCHANGE),
                eq("stock.reserve.requested"),
                eq(OutboxEvent.AGGREGATE_ORDER),
                eq(orderId),
                eventCaptor.capture()
        );

        StockItemsEvent event = assertInstanceOf(StockItemsEvent.class, eventCaptor.getValue());
        assertEquals(orderId, event.orderId());
        assertEquals(1, event.items().size());
        assertEquals(variantId, event.items().get(0).variantId());
        assertEquals(2, event.items().get(0).quantity());
    }

    @Test
    @DisplayName("payment.create.requested được ghi vào outbox")
    void publishPaymentCreateRequested_ShouldEnqueueOutboxRow() {
        UUID userId = UUID.randomUUID();

        publisher.publishPaymentCreateRequested(
                orderId,
                userId,
                "ORD-20260929-001",
                new BigDecimal("500000"),
                "VNPAY"
        );

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(outboxService).enqueue(
                eq(OrderSagaRoutingKeys.EXCHANGE),
                eq("payment.create.requested"),
                eq(OutboxEvent.AGGREGATE_ORDER),
                eq(orderId),
                eventCaptor.capture()
        );

        PaymentCreateRequestedEvent event =
                assertInstanceOf(PaymentCreateRequestedEvent.class, eventCaptor.getValue());
        assertEquals(userId, event.userId());
        assertEquals(new BigDecimal("500000"), event.amount());
    }

    @Test
    @DisplayName("stock.release.requested được ghi vào outbox và trả về true")
    void publishStockReleaseRequested_ShouldEnqueueAndReturnTrue() {
        boolean published = publisher.publishStockReleaseRequested(orderId, items);

        assertTrue(published);

        verify(outboxService).enqueue(
                eq(OrderSagaRoutingKeys.EXCHANGE),
                eq("stock.release.requested"),
                eq(OutboxEvent.AGGREGATE_ORDER),
                eq(orderId),
                any(StockItemsEvent.class)
        );
    }

    @Test
    @DisplayName("SAGA_CHAOS_MODE=STUCK_STOCK_RESERVE → không ghi outbox cho stock.reserve.requested")
    void publishStockReserveRequested_WhenChaosStuckStockReserve_ShouldNotEnqueue() {
        ReflectionTestUtils.setField(publisher, "chaosMode", SagaChaosMode.STUCK_STOCK_RESERVE);

        publisher.publishStockReserveRequested(orderId, items);

        verifyNoInteractions(outboxService);
    }

    @Test
    @DisplayName("SAGA_CHAOS_MODE=STUCK_PAYMENT → không ghi outbox cho payment.create.requested")
    void publishPaymentCreateRequested_WhenChaosStuckPayment_ShouldNotEnqueue() {
        ReflectionTestUtils.setField(publisher, "chaosMode", SagaChaosMode.STUCK_PAYMENT);

        publisher.publishPaymentCreateRequested(
                orderId,
                UUID.randomUUID(),
                "ORD-20260929-001",
                new BigDecimal("500000"),
                "VNPAY"
        );

        verifyNoInteractions(outboxService);
    }
}
