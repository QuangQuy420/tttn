package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OutboxEvent;
import com.tttn.orderservice.enums.OutboxStatus;
import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.repository.OutboxEventRepository;
import com.tttn.orderservice.service.OrderSagaLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.AmqpConnectException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.ReturnedMessage;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OutboxRelay - relay")
class OutboxRelayTest {

    private static final int MAX_ATTEMPTS = 20;

    @Mock
    private OutboxEventRepository outboxEventRepository;

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderSagaLogService orderSagaLogService;

    @Mock
    private RabbitTemplate rabbitTemplate;

    private OutboxRelay outboxRelay;

    @BeforeEach
    void setUp() {
        outboxRelay = new OutboxRelay(
                outboxEventRepository,
                orderRepository,
                orderSagaLogService,
                rabbitTemplate
        );

        ReflectionTestUtils.setField(outboxRelay, "batchSize", 50);
        ReflectionTestUtils.setField(outboxRelay, "maxAttempts", MAX_ATTEMPTS);
        ReflectionTestUtils.setField(outboxRelay, "confirmTimeoutMs", 1000L);
    }

    @Test
    @DisplayName("Broker ack → SENT, message có messageId = id dòng outbox")
    void relay_WhenBrokerAcks_ShouldMarkSentWithMessageIdEqualToRowId() {
        OutboxEvent row = pendingRow(0);
        when(outboxEventRepository.lockDueBatch(any(LocalDateTime.class), eq(50)))
                .thenReturn(List.of(row));
        confirmEverySend(true);

        outboxRelay.relay();

        ArgumentCaptor<Message> messageCaptor = ArgumentCaptor.forClass(Message.class);
        verify(rabbitTemplate).send(
                eq(OrderSagaRoutingKeys.EXCHANGE),
                eq(OrderSagaRoutingKeys.STOCK_RESERVE_REQUESTED),
                messageCaptor.capture(),
                any(CorrelationData.class)
        );

        Message message = messageCaptor.getValue();
        assertEquals(row.getId().toString(), message.getMessageProperties().getMessageId());
        assertEquals(
                MessageProperties.CONTENT_TYPE_JSON,
                message.getMessageProperties().getContentType()
        );
        assertEquals(row.getPayload(), new String(message.getBody(), StandardCharsets.UTF_8));

        assertEquals(OutboxStatus.SENT, row.getStatus());
        assertNotNull(row.getSentAt());
        assertEquals(0, row.getAttempts());
    }

    @Test
    @DisplayName("Broker nack → attempts + 1, lùi lịch theo backoff 2^(attempts-1)s, tối đa 60s")
    void relay_WhenBrokerNacks_ShouldIncrementAttemptsAndBackOff() {
        OutboxEvent secondRetry = pendingRow(2);
        OutboxEvent manyRetries = pendingRow(10);
        when(outboxEventRepository.lockDueBatch(any(LocalDateTime.class), anyInt()))
                .thenReturn(List.of(secondRetry, manyRetries));
        confirmEverySend(false);

        LocalDateTime before = LocalDateTime.now();
        outboxRelay.relay();

        assertEquals(OutboxStatus.PENDING, secondRetry.getStatus());
        assertEquals(3, secondRetry.getAttempts());
        assertNotNull(secondRetry.getLastError());
        assertNull(secondRetry.getSentAt());
        // attempts 3 → 2^2 = 4s
        assertBackoff(before, secondRetry, 4);

        assertEquals(OutboxStatus.PENDING, manyRetries.getStatus());
        assertEquals(11, manyRetries.getAttempts());
        // 2^10s is capped at 60s
        assertBackoff(before, manyRetries, 60);
    }

    @Test
    @DisplayName("Ack nhưng message bị trả lại (unroutable) → tính là thất bại")
    void relay_WhenMessageReturned_ShouldCountAsFailedAttempt() {
        OutboxEvent row = pendingRow(0);
        when(outboxEventRepository.lockDueBatch(any(LocalDateTime.class), anyInt()))
                .thenReturn(List.of(row));

        doAnswer(invocation -> {
            Message message = invocation.getArgument(2);
            CorrelationData correlationData = invocation.getArgument(3);
            correlationData.setReturned(new ReturnedMessage(
                    message, 312, "NO_ROUTE", row.getExchange(), row.getRoutingKey()
            ));
            correlationData.getFuture().complete(new CorrelationData.Confirm(true, null));
            return null;
        }).when(rabbitTemplate).send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));

        LocalDateTime before = LocalDateTime.now();
        outboxRelay.relay();

        assertEquals(OutboxStatus.PENDING, row.getStatus());
        assertEquals(1, row.getAttempts());
        assertTrue(row.getLastError().contains("312"));
        assertNull(row.getSentAt());
        assertBackoff(before, row, 1);
    }

    @Test
    @DisplayName("send ném lỗi (broker chết) → dòng đó và phần còn lại của batch đều được hẹn thử lại")
    void relay_WhenSendThrows_ShouldRescheduleRestOfBatch() {
        OutboxEvent first = pendingRow(0);
        OutboxEvent second = pendingRow(0);
        when(outboxEventRepository.lockDueBatch(any(LocalDateTime.class), anyInt()))
                .thenReturn(List.of(first, second));

        doThrow(new AmqpConnectException(new java.net.ConnectException("Connection refused")))
                .when(rabbitTemplate)
                .send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));

        outboxRelay.relay();

        // Stops at the first failure instead of paying the connection timeout once per row.
        verify(rabbitTemplate, times(1))
                .send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));

        for (OutboxEvent row : List.of(first, second)) {
            assertEquals(OutboxStatus.PENDING, row.getStatus());
            assertEquals(1, row.getAttempts());
            assertNotNull(row.getLastError());
            assertNotNull(row.getNextAttemptAt());
        }
    }

    @Test
    @DisplayName("Vượt quá max-attempts → FAILED và ghi saga log WARN cho đơn hàng")
    void relay_WhenMaxAttemptsReached_ShouldMarkFailedAndLogSagaWarn() {
        OutboxEvent row = pendingRow(MAX_ATTEMPTS - 1);
        Order order = Order.builder().id(row.getAggregateId()).build();

        when(outboxEventRepository.lockDueBatch(any(LocalDateTime.class), anyInt()))
                .thenReturn(List.of(row));
        when(orderRepository.findById(row.getAggregateId()))
                .thenReturn(Optional.of(order));
        confirmEverySend(false);

        outboxRelay.relay();

        assertEquals(OutboxStatus.FAILED, row.getStatus());
        assertEquals(MAX_ATTEMPTS, row.getAttempts());

        verify(orderSagaLogService).log(
                eq(order),
                eq(SagaLogStage.OUTBOX_FAILED),
                eq(SagaLogLevel.WARN),
                anyString(),
                eq(SagaLogService.ORDER_SERVICE),
                isNull(),
                eq(row.getLastError()),
                eq(MAX_ATTEMPTS)
        );
    }

    @Test
    @DisplayName("stock.release.requested FAILED → bật lại stockReleasePending cho đơn và lưu")
    void relay_WhenStockReleaseRowFails_ShouldSetStockReleasePendingAndSaveOrder() {
        OutboxEvent row = pendingRow(MAX_ATTEMPTS - 1);
        row.setRoutingKey(OrderSagaRoutingKeys.STOCK_RELEASE_REQUESTED);
        Order order = Order.builder()
                .id(row.getAggregateId())
                .stockReleasePending(false)
                .build();

        when(outboxEventRepository.lockDueBatch(any(LocalDateTime.class), anyInt()))
                .thenReturn(List.of(row));
        when(orderRepository.findById(row.getAggregateId()))
                .thenReturn(Optional.of(order));
        confirmEverySend(false);

        outboxRelay.relay();

        assertEquals(OutboxStatus.FAILED, row.getStatus());
        // SagaReconciliationJob picks it up again instead of leaking the reserved stock.
        assertTrue(order.isStockReleasePending());
        verify(orderRepository).save(order);
    }

    private void confirmEverySend(boolean ack) {
        doAnswer(invocation -> {
            CorrelationData correlationData = invocation.getArgument(3);
            correlationData.getFuture().complete(
                    new CorrelationData.Confirm(ack, ack ? null : "nack from broker")
            );
            return null;
        }).when(rabbitTemplate).send(anyString(), anyString(), any(Message.class), any(CorrelationData.class));
    }

    private void assertBackoff(LocalDateTime before, OutboxEvent row, long expectedSeconds) {
        LocalDateTime after = LocalDateTime.now();

        assertFalse(
                row.getNextAttemptAt().isBefore(before.plusSeconds(expectedSeconds)),
                "nextAttemptAt too early: " + row.getNextAttemptAt()
        );
        assertFalse(
                row.getNextAttemptAt().isAfter(after.plusSeconds(expectedSeconds)),
                "nextAttemptAt too late: " + row.getNextAttemptAt()
        );
    }

    private OutboxEvent pendingRow(int attempts) {
        LocalDateTime now = LocalDateTime.now();

        return OutboxEvent.builder()
                .aggregateType(OutboxEvent.AGGREGATE_ORDER)
                .aggregateId(UUID.randomUUID())
                .exchange(OrderSagaRoutingKeys.EXCHANGE)
                .routingKey(OrderSagaRoutingKeys.STOCK_RESERVE_REQUESTED)
                .payload("{\"orderId\":\"" + UUID.randomUUID() + "\",\"items\":[]}")
                .status(OutboxStatus.PENDING)
                .attempts(attempts)
                .nextAttemptAt(now)
                .createdAt(now)
                .build();
    }
}
