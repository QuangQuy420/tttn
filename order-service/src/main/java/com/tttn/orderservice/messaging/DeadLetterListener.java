package com.tttn.orderservice.messaging;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.tttn.orderservice.config.RabbitMqConfig;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.OrderSagaLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Consumes {@code order-saga-events.dlq} (FR12) — the shared dead-letter queue all 3 saga queues
 * (order-service/product-service/payment-service) route into once a message is nacked without
 * requeue (malformed payload) or redelivered past {@code x-delivery-limit}
 * (see {@link com.tttn.orderservice.config.RabbitMqConfig}). Purely observational: logs a WARN
 * with the original routing key, body, and redelivery count read off RabbitMQ's own
 * {@code x-death} header — no business logic, no republish, no retry (FR10-FR12).
 *
 * <p>Also best-effort attaches a {@code DEAD_LETTERED} entry (FR14/T24) to the order's saga log
 * if the payload is intact enough to read an {@code orderId} that matches a real order — a
 * payload broken enough that {@code orderId} can't be read at all just stays a console-only log
 * line, since there is no order to attach it to.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeadLetterListener {

    private final OrderRepository orderRepository;
    private final OrderSagaLogService orderSagaLogService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @RabbitListener(queues = RabbitMqConfig.ORDER_SAGA_EVENTS_DLQ)
    public void handleDeadLetter(Message message) {
        Map<String, Object> headers = message.getMessageProperties().getHeaders();
        String body = new String(message.getBody(), StandardCharsets.UTF_8);

        String originalRoutingKey = "không xác định";
        long redeliveryCount = -1;

        Object xDeath = headers.get("x-death");
        if (xDeath instanceof List<?> deaths
                && !deaths.isEmpty()
                && deaths.get(0) instanceof Map<?, ?> firstDeath) {
            Object routingKeys = firstDeath.get("routing-keys");
            if (routingKeys instanceof List<?> keys && !keys.isEmpty()) {
                originalRoutingKey = String.valueOf(keys.get(0));
            }

            Object count = firstDeath.get("count");
            if (count instanceof Number number) {
                redeliveryCount = number.longValue();
            }
        }

        log.warn(
                "Message bị đưa vào dead-letter queue '{}': routing-key gốc='{}', "
                        + "số lần đã redeliver={}, nội dung={}",
                RabbitMqConfig.ORDER_SAGA_EVENTS_DLQ,
                originalRoutingKey,
                redeliveryCount,
                body
        );

        attachToOrderIfPossible(body, originalRoutingKey, redeliveryCount);
    }

    private void attachToOrderIfPossible(
            String body,
            String originalRoutingKey,
            long redeliveryCount
    ) {
        UUID orderId = extractOrderId(body);

        if (orderId == null) {
            return;
        }

        Order order = orderRepository.findById(orderId).orElse(null);

        if (order == null) {
            return;
        }

        orderSagaLogService.log(
                order,
                SagaLogStage.DEAD_LETTERED,
                SagaLogLevel.WARN,
                "Message '" + originalRoutingKey
                        + "' bị chuyển vào dead-letter queue sau "
                        + redeliveryCount + " lần redeliver",
                SagaLogService.MESSAGE_BROKER,
                SagaLogService.ORDER_SERVICE,
                "Message '" + originalRoutingKey + "' bị redeliver " + redeliveryCount
                        + " lần rồi vào dead-letter queue",
                null
        );
    }

    private UUID extractOrderId(String body) {
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode orderIdNode = root.get("orderId");

            if (orderIdNode == null || orderIdNode.isNull()) {
                return null;
            }

            return UUID.fromString(orderIdNode.asText());
        } catch (Exception exception) {
            return null;
        }
    }
}
