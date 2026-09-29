package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.OutboxEvent;
import com.tttn.orderservice.enums.OutboxStatus;
import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.repository.OutboxEventRepository;
import com.tttn.orderservice.service.OrderSagaLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.core.ReturnedMessage;
import org.springframework.amqp.rabbit.connection.CorrelationData;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

/**
 * Publishes {@code outbox_events} rows to RabbitMQ (transactional outbox relay). Every
 * {@code poll-interval-ms} it locks up to {@code batch-size} due {@code PENDING} rows
 * ({@code FOR UPDATE SKIP LOCKED}, so several instances can run safely), sends the whole batch,
 * then waits for each publisher confirm:
 * <ul>
 *   <li>ack and not returned → {@code SENT};</li>
 *   <li>nack, timeout, returned (unroutable) or send error → {@code attempts + 1} and retry after
 *   {@code min(2^(attempts-1), 60)} seconds (1s, 2s, 4s…);</li>
 *   <li>{@code attempts >= max-attempts} → {@code FAILED} + a WARN saga log on the order.</li>
 * </ul>
 * The AMQP {@code messageId} is the outbox row id, so consumers can drop duplicates. Delivery is
 * at-least-once: a message acked by the broker whose row update then fails to commit is sent
 * again on a later run.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OutboxRelay {

    private static final long MAX_BACKOFF_SECONDS = 60;
    private static final int MAX_ERROR_LENGTH = 1000;

    private final OutboxEventRepository outboxEventRepository;
    private final OrderRepository orderRepository;
    private final OrderSagaLogService orderSagaLogService;
    private final RabbitTemplate rabbitTemplate;

    @Value("${app.outbox.batch-size:50}")
    private int batchSize;

    @Value("${app.outbox.max-attempts:20}")
    private int maxAttempts;

    @Value("${app.outbox.confirm-timeout-ms:5000}")
    private long confirmTimeoutMs;

    // @Transactional keeps the row locks from lockDueBatch until the status updates below commit.
    @Scheduled(fixedDelayString = "${app.outbox.poll-interval-ms:1000}")
    @Transactional
    public void relay() {
        List<OutboxEvent> batch = outboxEventRepository.lockDueBatch(
                LocalDateTime.now(),
                batchSize
        );

        if (batch.isEmpty()) {
            return;
        }

        // Send the whole batch first, then await the confirms, so one slow confirm does not
        // serialize the batch. sent.get(i) is the CorrelationData of batch.get(i).
        List<CorrelationData> sent = new ArrayList<>(batch.size());

        for (int i = 0; i < batch.size(); i++) {
            OutboxEvent event = batch.get(i);
            CorrelationData correlationData =
                    new CorrelationData(event.getId().toString());

            try {
                rabbitTemplate.send(
                        event.getExchange(),
                        event.getRoutingKey(),
                        toMessage(event),
                        correlationData
                );
                sent.add(correlationData);
            } catch (AmqpException exception) {
                // Broker unreachable: the rest of the batch would fail the same way, so reschedule
                // them all now instead of paying the connection timeout once per row.
                log.warn(
                        "OutboxRelay: không thể gửi sự kiện outbox {} ({}), hoãn {} sự kiện còn lại: {}",
                        event.getId(),
                        event.getRoutingKey(),
                        batch.size() - i,
                        exception.getMessage()
                );

                for (int j = i; j < batch.size(); j++) {
                    markFailedAttempt(
                            batch.get(j),
                            "Gửi tới RabbitMQ thất bại: " + exception.getMessage()
                    );
                }
                break;
            } catch (RuntimeException exception) {
                // Not a broker problem (e.g. a bad row): count an attempt for this row only, so it
                // backs off instead of rolling back and retrying the whole batch every tick.
                log.warn(
                        "OutboxRelay: không thể gửi sự kiện outbox {} ({}): {}",
                        event.getId(),
                        event.getRoutingKey(),
                        exception.getMessage()
                );

                markFailedAttempt(
                        event,
                        "Lỗi khi gửi sự kiện: " + exception.getMessage()
                );
                sent.add(null);
            }
        }

        for (int i = 0; i < sent.size(); i++) {
            // null = send failed and the row was already rescheduled above.
            if (sent.get(i) != null) {
                awaitConfirm(batch.get(i), sent.get(i));
            }
        }
    }

    private void awaitConfirm(OutboxEvent event, CorrelationData correlationData) {
        try {
            CorrelationData.Confirm confirm = correlationData.getFuture()
                    .get(confirmTimeoutMs, TimeUnit.MILLISECONDS);

            ReturnedMessage returned = correlationData.getReturned();

            if (!confirm.ack()) {
                markFailedAttempt(event, "Broker từ chối (nack): " + confirm.reason());
            } else if (returned != null) {
                markFailedAttempt(
                        event,
                        "Không có queue nhận message (unroutable): "
                                + returned.getReplyCode() + " " + returned.getReplyText()
                );
            } else {
                event.setStatus(OutboxStatus.SENT);
                event.setSentAt(LocalDateTime.now());
            }
        } catch (TimeoutException exception) {
            markFailedAttempt(event, "Hết thời gian chờ xác nhận từ broker");
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            markFailedAttempt(event, "Bị gián đoạn khi chờ xác nhận từ broker");
        } catch (ExecutionException exception) {
            markFailedAttempt(
                    event,
                    "Lỗi khi chờ xác nhận từ broker: " + exception.getMessage()
            );
        }
    }

    private void markFailedAttempt(OutboxEvent event, String error) {
        int attempts = event.getAttempts() + 1;
        String lastError = truncate(error);

        event.setAttempts(attempts);
        event.setLastError(lastError);

        if (attempts >= maxAttempts) {
            event.setStatus(OutboxStatus.FAILED);

            log.error(
                    "OutboxRelay: sự kiện outbox {} ({}, aggregate {}) thất bại sau {} lần thử: {}",
                    event.getId(),
                    event.getRoutingKey(),
                    event.getAggregateId(),
                    attempts,
                    lastError
            );

            logSagaFailure(event);
            return;
        }

        // 2^(attempts-1) seconds after the increment: 1s, 2s, 4s… capped at 60s.
        long backoffSeconds = Math.min(
                1L << Math.min(attempts - 1, 30),
                MAX_BACKOFF_SECONDS
        );
        event.setNextAttemptAt(LocalDateTime.now().plusSeconds(backoffSeconds));
    }

    private void logSagaFailure(OutboxEvent event) {
        if (!OutboxEvent.AGGREGATE_ORDER.equals(event.getAggregateType())) {
            return;
        }

        orderRepository.findById(event.getAggregateId())
                .ifPresent(order -> {
                    // Callers cleared stockReleasePending once the release was enqueued; set it
                    // back so SagaReconciliationJob re-enqueues the release instead of leaking
                    // the reserved stock.
                    if (OrderSagaRoutingKeys.STOCK_RELEASE_REQUESTED.equals(event.getRoutingKey())) {
                        order.setStockReleasePending(true);
                        orderRepository.save(order);
                    }

                    orderSagaLogService.log(
                            order,
                            SagaLogStage.OUTBOX_FAILED,
                            SagaLogLevel.WARN,
                            "Gửi sự kiện thất bại sau nhiều lần thử",
                            SagaLogService.ORDER_SERVICE,
                            null,
                            event.getLastError(),
                            event.getAttempts()
                    );
                });
    }

    private Message toMessage(OutboxEvent event) {
        MessageProperties properties = new MessageProperties();
        properties.setContentType(MessageProperties.CONTENT_TYPE_JSON);
        properties.setContentEncoding(StandardCharsets.UTF_8.name());
        properties.setMessageId(event.getId().toString());
        properties.setTimestamp(new Date());

        return new Message(
                event.getPayload().getBytes(StandardCharsets.UTF_8),
                properties
        );
    }

    // order_saga_logs.error_detail is VARCHAR(1000); an over-long value would fail this whole
    // transaction at commit and roll back the batch's status updates.
    private String truncate(String error) {
        if (error == null || error.length() <= MAX_ERROR_LENGTH) {
            return error;
        }

        return error.substring(0, MAX_ERROR_LENGTH);
    }
}
