package com.tttn.orderservice.messaging;

import com.tttn.orderservice.config.RabbitMqConfig;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * Consumes {@code product-events.dlq} — where the broker routes a catalog event once it is
 * nacked without requeue (malformed payload) or redelivered past the
 * {@code product-events.order-service} queue's {@code x-delivery-limit} (see
 * {@link com.tttn.orderservice.config.RabbitMqConfig}). Purely observational: logs a WARN with
 * the original routing key, body, and redelivery count read off RabbitMQ's own {@code x-death}
 * header — no business logic, no republish, no retry. Unlike {@link DeadLetterListener}, these
 * messages carry no {@code orderId}, so there is no saga log to attach to.
 */
@Slf4j
@Component
public class ProductEventsDeadLetterListener {

    @RabbitListener(queues = RabbitMqConfig.PRODUCT_EVENTS_DLQ)
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
                RabbitMqConfig.PRODUCT_EVENTS_DLQ,
                originalRoutingKey,
                redeliveryCount,
                body
        );
    }
}
