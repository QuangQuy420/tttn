package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.enums.SagaChaosMode;
import com.tttn.orderservice.exception.ExternalServiceException;
import com.tttn.orderservice.messaging.event.OrderSagaItem;
import com.tttn.orderservice.messaging.event.PaymentCreateRequestedEvent;
import com.tttn.orderservice.messaging.event.StockItemsEvent;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
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
 *
 * <p>{@code chaosMode} ({@code SAGA_CHAOS_MODE} env var, see {@link SagaChaosMode}) is a
 * dev/test-only knob, off by default — when set it makes the matching publish step silently
 * no-op so an order gets stuck without ever throwing, letting
 * {@code SagaReconciliationJob}'s retry/exhausted behavior be exercised on demand.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderSagaEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    @Value("${app.saga.chaos-mode}")
    private SagaChaosMode chaosMode;

    public void publishStockReserveRequested(
            UUID orderId,
            List<OrderItem> items
    ) {
        if (chaosMode == SagaChaosMode.STUCK_STOCK_RESERVE) {
            log.warn(
                    "[SAGA_CHAOS_MODE=STUCK_STOCK_RESERVE] Bỏ qua gửi 'stock.reserve.requested' "
                            + "cho đơn hàng {} để giả lập đơn bị kẹt",
                    orderId
            );
            return;
        }

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
        if (chaosMode == SagaChaosMode.STUCK_PAYMENT) {
            log.warn(
                    "[SAGA_CHAOS_MODE=STUCK_PAYMENT] Bỏ qua gửi 'payment.create.requested' "
                            + "cho đơn hàng {} để giả lập đơn bị kẹt",
                    orderId
            );
            return;
        }

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

    /**
     * @return {@code true} if the local publish call did not throw (best-effort — no publisher
     * confirms, see plan's Risks & dependencies), {@code false} if it was caught and logged.
     * Callers use this to drive {@code Order.stockReleasePending} (FR7): set the flag
     * {@code true} before calling, then {@code false} only when this returns {@code true}.
     */
    public boolean publishStockReleaseRequested(
            UUID orderId,
            List<OrderItem> items
    ) {
        StockItemsEvent event = new StockItemsEvent(
                orderId,
                LocalDateTime.now(),
                toSagaItems(items)
        );

        return publishBestEffort(
                OrderSagaRoutingKeys.STOCK_RELEASE_REQUESTED,
                event
        );
    }

    private boolean publishBestEffort(
            String routingKey,
            Object event
    ) {
        try {
            rabbitTemplate.convertAndSend(
                    OrderSagaRoutingKeys.EXCHANGE,
                    routingKey,
                    event
            );

            return true;
        } catch (Exception exception) {
            log.error(
                    "Không thể gửi sự kiện saga '{}': {}",
                    routingKey,
                    exception.getMessage(),
                    exception
            );

            return false;
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
