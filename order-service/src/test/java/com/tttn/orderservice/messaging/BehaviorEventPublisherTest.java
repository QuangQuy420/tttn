package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.messaging.event.BehaviorEvent;
import com.tttn.orderservice.service.OutboxService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.MessagePostProcessor;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("BehaviorEventPublisher - ADD_TO_CART / PURCHASE")
class BehaviorEventPublisherTest {

    @Mock
    private RabbitTemplate rabbitTemplate;

    @Mock
    private OutboxService outboxService;

    private BehaviorEventPublisher publisher;

    private UUID orderId;
    private UUID userId;
    private UUID productId;
    private UUID variantId;

    @BeforeEach
    void setUp() {
        publisher = new BehaviorEventPublisher(rabbitTemplate, outboxService);

        orderId = UUID.randomUUID();
        userId = UUID.randomUUID();
        productId = UUID.randomUUID();
        variantId = UUID.randomUUID();
    }

    @Test
    @DisplayName("PURCHASE được ghi vào outbox với exchange/key/aggregate đúng và eventId cố định theo đơn + biến thể")
    void enqueuePurchase_ShouldEnqueueOutboxRowWithDeterministicEventId() {
        Order order = Order.builder()
                .id(orderId)
                .userId(userId)
                .build();
        OrderItem item = OrderItem.builder()
                .productId(productId)
                .variantId(variantId)
                .quantity(2)
                .build();

        publisher.enqueuePurchase(order, item);
        publisher.enqueuePurchase(order, item);

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(outboxService, times(2)).enqueue(
                eq("behavior-events"),
                eq("behavior.purchase"),
                eq("BEHAVIOR_EVENT"),
                eq(orderId),
                eventCaptor.capture()
        );

        BehaviorEvent first = assertInstanceOf(BehaviorEvent.class, eventCaptor.getAllValues().get(0));
        BehaviorEvent second = assertInstanceOf(BehaviorEvent.class, eventCaptor.getAllValues().get(1));

        assertEquals(first.eventId(), second.eventId());
        assertEquals("PURCHASE", first.eventType());
        assertEquals(userId, first.userId());
        assertEquals(productId, first.productId());
        assertEquals("order-service", first.source());
        assertEquals(orderId, first.context().get("orderId"));
        assertEquals(variantId, first.context().get("variantId"));
        assertEquals(2, first.context().get("quantity"));

        verifyNoInteractions(rabbitTemplate);
    }

    @Test
    @DisplayName("ADD_TO_CART gửi thẳng RabbitMQ; lỗi AmqpException bị nuốt, không ném ra ngoài")
    void publishAddToCart_WhenBrokerFails_ShouldSwallowAmqpException() {
        doThrow(new AmqpException("broker down"))
                .when(rabbitTemplate)
                .convertAndSend(
                        anyString(),
                        anyString(),
                        any(Object.class),
                        any(MessagePostProcessor.class)
                );

        assertDoesNotThrow(() -> publisher.publishAddToCart(userId, productId, variantId, 3));

        ArgumentCaptor<Object> eventCaptor = ArgumentCaptor.forClass(Object.class);
        verify(rabbitTemplate).convertAndSend(
                eq("behavior-events"),
                eq("behavior.add_to_cart"),
                eventCaptor.capture(),
                any(MessagePostProcessor.class)
        );

        BehaviorEvent event = assertInstanceOf(BehaviorEvent.class, eventCaptor.getValue());
        assertEquals("ADD_TO_CART", event.eventType());
        assertEquals(userId, event.userId());
        assertEquals(productId, event.productId());
        assertEquals(variantId, event.context().get("variantId"));
        assertEquals(3, event.context().get("quantity"));

        verifyNoInteractions(outboxService);
    }
}
