package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.exception.ExternalServiceException;
import com.tttn.orderservice.messaging.event.OrderSagaItem;
import com.tttn.orderservice.messaging.event.PaymentCreateRequestedEvent;
import com.tttn.orderservice.messaging.event.StockItemsEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Publishes checkout-saga events to the {@code order-saga-events} topic exchange via Spring
 * AMQP's {@link RabbitTemplate}. Every publish here is best-effort (caught, logged, never
 * thrown) EXCEPT {@link #publishStockReserveRequested}, the saga's first step — without it
 * succeeding the order can never move at all, so it throws {@link ExternalServiceException}
 * instead, letting {@code checkout()}'s {@code @Transactional} roll back the order it just
 * saved (NFR3/AC11).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderSagaEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    public void publishStockReserveRequested(
            UUID orderId,
            List<OrderItem> items
    ) {
        StockItemsEvent event = new StockItemsEvent(
                orderId,
                LocalDateTime.now(),
                toSagaItems(items)
        );

        try {
            rabbitTemplate.convertAndSend(
                    OrderSagaRoutingKeys.EXCHANGE,
                    OrderSagaRoutingKeys.STOCK_RESERVE_REQUESTED,
                    event
            );
        } catch (Exception exception) {
            throw new ExternalServiceException(
                    "Không thể gửi yêu cầu giữ hàng: "
                            + exception.getMessage(),
                    exception
            );
        }
    }

    public void publishPaymentCreateRequested(
            UUID orderId,
            UUID userId,
            String orderCode,
            BigDecimal amount,
            String paymentMethod
    ) {
        PaymentCreateRequestedEvent event = new PaymentCreateRequestedEvent(
                orderId,
                LocalDateTime.now(),
                userId,
                orderCode,
                amount,
                paymentMethod
        );

        publishBestEffort(
                OrderSagaRoutingKeys.PAYMENT_CREATE_REQUESTED,
                event
        );
    }

    public void publishStockReleaseRequested(
            UUID orderId,
            List<OrderItem> items
    ) {
        StockItemsEvent event = new StockItemsEvent(
                orderId,
                LocalDateTime.now(),
                toSagaItems(items)
        );

        publishBestEffort(
                OrderSagaRoutingKeys.STOCK_RELEASE_REQUESTED,
                event
        );
    }

    private void publishBestEffort(
            String routingKey,
            Object event
    ) {
        try {
            rabbitTemplate.convertAndSend(
                    OrderSagaRoutingKeys.EXCHANGE,
                    routingKey,
                    event
            );
        } catch (Exception exception) {
            log.error(
                    "Không thể gửi sự kiện saga '{}': {}",
                    routingKey,
                    exception.getMessage(),
                    exception
            );
        }
    }

    private List<OrderSagaItem> toSagaItems(List<OrderItem> items) {
        return items.stream()
                .map(item -> new OrderSagaItem(
                        item.getVariantId(),
                        item.getQuantity()
                ))
                .toList();
    }
}
