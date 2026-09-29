package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.config.RabbitMqConfig;
import com.tttn.orderservice.entity.OutboxEvent;
import com.tttn.orderservice.enums.OutboxStatus;
import com.tttn.orderservice.messaging.OrderSagaRoutingKeys;
import com.tttn.orderservice.messaging.event.OrderSagaItem;
import com.tttn.orderservice.messaging.event.StockItemsEvent;
import com.tttn.orderservice.repository.OutboxEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
@DisplayName("OutboxServiceImpl - enqueue")
class OutboxServiceImplTest {

    @Mock
    private OutboxEventRepository outboxEventRepository;

    private OutboxServiceImpl outboxService;

    @BeforeEach
    void setUp() {
        // The real converter bean, so the stored payload is exactly what RabbitTemplate sent before.
        outboxService = new OutboxServiceImpl(
                outboxEventRepository,
                new RabbitMqConfig().jsonMessageConverter()
        );
    }

    @Test
    @DisplayName("Lưu một dòng outbox PENDING với payload JSON của sự kiện")
    void enqueue_ShouldSavePendingRowWithJsonPayload() {
        UUID orderId = UUID.randomUUID();
        UUID variantId = UUID.randomUUID();

        StockItemsEvent event = new StockItemsEvent(
                orderId,
                LocalDateTime.now(),
                List.of(new OrderSagaItem(variantId, 2))
        );

        outboxService.enqueue(
                OrderSagaRoutingKeys.EXCHANGE,
                OrderSagaRoutingKeys.STOCK_RESERVE_REQUESTED,
                OutboxEvent.AGGREGATE_ORDER,
                orderId,
                event
        );

        ArgumentCaptor<OutboxEvent> captor = ArgumentCaptor.forClass(OutboxEvent.class);
        verify(outboxEventRepository).save(captor.capture());

        OutboxEvent row = captor.getValue();

        assertNotNull(row.getId());
        assertEquals(OrderSagaRoutingKeys.EXCHANGE, row.getExchange());
        assertEquals("stock.reserve.requested", row.getRoutingKey());
        assertEquals(OutboxEvent.AGGREGATE_ORDER, row.getAggregateType());
        assertEquals(orderId, row.getAggregateId());
        assertEquals(OutboxStatus.PENDING, row.getStatus());
        assertEquals(0, row.getAttempts());
        assertNotNull(row.getNextAttemptAt());
        assertNotNull(row.getCreatedAt());
        assertNull(row.getSentAt());

        // Payload is a JSON object (not a double-encoded string) with the contract's fields.
        JsonNode payload = JsonMapper.builder().build().readTree(row.getPayload());

        assertTrue(payload.isObject());
        assertEquals(orderId.toString(), payload.get("orderId").asString());
        assertEquals(variantId.toString(), payload.get("items").get(0).get("variantId").asString());
        assertEquals(2, payload.get("items").get(0).get("quantity").asInt());
    }
}
