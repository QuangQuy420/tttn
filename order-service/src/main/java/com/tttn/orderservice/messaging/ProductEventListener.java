package com.tttn.orderservice.messaging;

import com.tttn.orderservice.config.RabbitMqConfig;
import com.tttn.orderservice.messaging.event.ProductChangedEvent;
import com.tttn.orderservice.service.CartService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

/**
 * Keeps Redis carts in sync with admin product changes: every {@code product.updated} /
 * {@code product.deleted} re-applies the product's latest state to all carts holding it
 * (see {@link CartService#syncProduct}). Idempotent by design — it always sets items to the
 * current product state, so duplicate or out-of-order deliveries are harmless. A
 * product-service outage throws, so the message is redelivered and, past the queue's
 * delivery limit, dead-lettered to {@code product-events.dlq}.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProductEventListener {

    private final CartService cartService;

    @RabbitListener(queues = RabbitMqConfig.PRODUCT_EVENTS_QUEUE)
    public void handle(
            ProductChangedEvent event,
            @Header(AmqpHeaders.RECEIVED_ROUTING_KEY) String routingKey
    ) {
        if (event.productId() == null) {
            log.warn(
                    "Bỏ qua sự kiện sản phẩm '{}' không có productId",
                    routingKey
            );
            return;
        }

        cartService.syncProduct(event.productId());
    }
}
