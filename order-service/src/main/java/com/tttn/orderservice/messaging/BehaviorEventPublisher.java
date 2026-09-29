package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.messaging.event.BehaviorEvent;
import com.tttn.orderservice.service.OutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.core.MessageDeliveryMode;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Produces user behavior events for the {@code behavior-events} topic exchange
 * (see {@code infra/contracts/behavior-events.md}).
 *
 * <p>{@code ADD_TO_CART} is best-effort: sent straight through {@link RabbitTemplate}, and a
 * broker error is only logged so adding to the cart never fails because of it.
 * {@code PURCHASE} goes through the transactional outbox inside the caller's
 * {@code @Transactional}, with a deterministic {@code eventId} per order + variant, so a
 * redelivered {@code payment.completed} can never produce a duplicate interaction.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class BehaviorEventPublisher {

    private static final String SOURCE = "order-service";
    private static final String EVENT_TYPE_ADD_TO_CART = "ADD_TO_CART";
    private static final String EVENT_TYPE_PURCHASE = "PURCHASE";

    private final RabbitTemplate rabbitTemplate;
    private final OutboxService outboxService;

    public void publishAddToCart(
            UUID userId,
            UUID productId,
            UUID variantId,
            int quantity
    ) {
        try {
            Map<String, Object> context = new LinkedHashMap<>();
            context.put("variantId", variantId);
            context.put("quantity", quantity);

            BehaviorEvent event = new BehaviorEvent(
                    UUID.randomUUID(),
                    EVENT_TYPE_ADD_TO_CART,
                    userId,
                    productId,
                    Instant.now().toString(),
                    SOURCE,
                    context
            );

            rabbitTemplate.convertAndSend(
                    BehaviorEventRoutingKeys.EXCHANGE,
                    BehaviorEventRoutingKeys.ADD_TO_CART,
                    event,
                    message -> {
                        message.getMessageProperties()
                                .setDeliveryMode(MessageDeliveryMode.PERSISTENT);
                        message.getMessageProperties()
                                .setMessageId(event.eventId().toString());
                        return message;
                    }
            );
        } catch (AmqpException ex) {
            log.warn(
                    "Không gửi được sự kiện hành vi 'ADD_TO_CART' (user={}, variant={}): {}",
                    userId,
                    variantId,
                    ex.getMessage()
            );
        }
    }

    public void enqueuePurchase(
            Order order,
            OrderItem item
    ) {
        UUID eventId = UUID.nameUUIDFromBytes(
                ("purchase:" + order.getId() + ":" + item.getVariantId())
                        .getBytes(StandardCharsets.UTF_8)
        );

        Map<String, Object> context = new LinkedHashMap<>();
        context.put("orderId", order.getId());
        context.put("variantId", item.getVariantId());
        context.put("quantity", item.getQuantity());

        BehaviorEvent event = new BehaviorEvent(
                eventId,
                EVENT_TYPE_PURCHASE,
                order.getUserId(),
                item.getProductId(),
                Instant.now().toString(),
                SOURCE,
                context
        );

        outboxService.enqueue(
                BehaviorEventRoutingKeys.EXCHANGE,
                BehaviorEventRoutingKeys.PURCHASE,
                BehaviorEventRoutingKeys.AGGREGATE_BEHAVIOR,
                order.getId(),
                event
        );
    }
}
