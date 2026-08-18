package com.tttn.orderservice.messaging;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.config.RabbitMqConfig;
import com.tttn.orderservice.dto.response.ProductResponse;
import com.tttn.orderservice.enums.ProductStatus;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.messaging.event.ProductEvent;
import com.tttn.orderservice.service.CartService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;

/**
 * Consumes catalog events off the durable queue bound to {@code product.updated} /
 * {@code product.deleted} (see {@link RabbitMqConfig}) and keeps Redis cart snapshots in sync.
 * The event payload is deliberately thin ({@code { productId, occurredAt }}), so every
 * {@code product.updated} re-fetches the product's CURRENT state via {@link ProductClient} and
 * overwrites the snapshots — idempotent by construction, duplicated or reordered deliveries
 * converge to the same result.
 *
 * <p>A product that no longer exists (404) or is no longer {@code PUBLISHED} is treated the
 * same as {@code product.deleted}: its items leave every cart. An
 * {@link com.tttn.orderservice.exception.ExternalServiceException} (product-service down) is
 * deliberately NOT caught — the message is nacked and requeued until the queue's
 * {@code x-delivery-limit} routes it to {@code product-events.dlq}, observed by
 * {@link ProductEventsDeadLetterListener}. No DB access happens here, so no transaction.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProductEventListener {

    private final ProductClient productClient;
    private final CartService cartService;

    @RabbitListener(queues = RabbitMqConfig.PRODUCT_EVENTS_QUEUE)
    public void handle(
            ProductEvent event,
            @Header(AmqpHeaders.RECEIVED_ROUTING_KEY) String routingKey
    ) {
        if (event == null || event.productId() == null) {
            log.warn(
                    "Bỏ qua sự kiện sản phẩm '{}' thiếu productId",
                    routingKey
            );
            return;
        }

        switch (routingKey) {
            case ProductEventRoutingKeys.PRODUCT_UPDATED ->
                    handleProductUpdated(event);

            case ProductEventRoutingKeys.PRODUCT_DELETED ->
                    cartService.removeProductFromCarts(event.productId());

            default -> log.warn(
                    "Bỏ qua routing key sự kiện sản phẩm không xác định: {}",
                    routingKey
            );
        }
    }

    private void handleProductUpdated(ProductEvent event) {
        ProductResponse product;

        try {
            product = productClient.getProductById(event.productId());
        } catch (ResourceNotFoundException exception) {
            // Product vanished between the event and this fetch — same outcome as
            // 'product.deleted': its items leave every cart.
            cartService.removeProductFromCarts(event.productId());
            return;
        }

        if (product.status() != ProductStatus.PUBLISHED) {
            cartService.removeProductFromCarts(event.productId());
            return;
        }

        cartService.refreshProductInCarts(product);
    }
}
