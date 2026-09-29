package com.tttn.orderservice.messaging;

import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.entity.OutboxEvent;
import com.tttn.orderservice.enums.SagaChaosMode;
import com.tttn.orderservice.messaging.event.OrderSagaItem;
import com.tttn.orderservice.messaging.event.PaymentCreateRequestedEvent;
import com.tttn.orderservice.messaging.event.StockItemsEvent;
import com.tttn.orderservice.service.OutboxService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Produces checkout-saga events for the {@code order-saga-events} topic exchange through the
 * transactional outbox: every method only inserts an {@code outbox_events} row via
 * {@link OutboxService#enqueue} inside the caller's {@code @Transactional}, and
 * {@link OutboxRelay} publishes it to RabbitMQ afterwards (publisher confirms + retry with
 * backoff). So an event goes out if and only if the business change that produced it commits,
 * and a RabbitMQ outage no longer fails checkout — the saga simply resumes once the broker is
 * back (eventual consistency). Payloads and routing keys are unchanged.
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

    private final OutboxService outboxService;

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

        enqueue(
                orderId,
                OrderSagaRoutingKeys.STOCK_RESERVE_REQUESTED,
                event
        );
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

        enqueue(
                orderId,
                OrderSagaRoutingKeys.PAYMENT_CREATE_REQUESTED,
                event
        );
    }

    /**
     * @return {@code true} once the event is durably queued in the outbox (the relay delivers it
     * with retries). Callers use this to drive {@code Order.stockReleasePending} (FR7): set the
     * flag {@code true} before calling, then {@code false} only when this returns {@code true}.
     * An enqueue failure throws and rolls back the caller's transaction instead of returning
     * {@code false}.
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

        enqueue(
                orderId,
                OrderSagaRoutingKeys.STOCK_RELEASE_REQUESTED,
                event
        );

        return true;
    }

    private void enqueue(
            UUID orderId,
            String routingKey,
            Object event
    ) {
        outboxService.enqueue(
                OrderSagaRoutingKeys.EXCHANGE,
                routingKey,
                OutboxEvent.AGGREGATE_ORDER,
                orderId,
                event
        );
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
