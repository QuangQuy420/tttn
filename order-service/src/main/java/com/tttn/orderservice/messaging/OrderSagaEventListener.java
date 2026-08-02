package com.tttn.orderservice.messaging;

import com.tttn.orderservice.config.RabbitMqConfig;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.entity.OrderStatusHistory;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.enums.SagaChaosMode;
import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;
import com.tttn.orderservice.messaging.event.OrderSagaReplyEvent;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.CartService;
import com.tttn.orderservice.service.OrderSagaLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.amqp.support.AmqpHeaders;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.handler.annotation.Header;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Consumes checkout-saga replies off the durable queue bound to {@code stock.reserved} /
 * {@code stock.reserve.rejected} / {@code payment.completed} / {@code payment.failed}
 * (see {@link RabbitMqConfig}). Every branch re-loads the order and checks its CURRENT status
 * before acting (NFR2/AC8) — RabbitMQ delivers at-least-once, and a user action (cancel) can
 * race a saga reply, so a stale or duplicate message must never blindly advance the order.
 *
 * <p>{@code chaosMode == FORCE_DEAD_LETTER} ({@code SAGA_CHAOS_MODE} env var, dev/test-only,
 * off by default — see {@link SagaChaosMode}) makes {@link #handle} throw immediately for every
 * reply, so the message keeps getting redelivered until it exceeds the queue's
 * {@code x-delivery-limit} and the broker routes it to the dead-letter queue — lets
 * {@link DeadLetterListener} be exercised on demand.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class OrderSagaEventListener {

    private final OrderRepository orderRepository;
    private final OrderSagaEventPublisher orderSagaEventPublisher;
    private final CartService cartService;
    private final OrderSagaLogService orderSagaLogService;

    @Value("${app.saga.chaos-mode}")
    private SagaChaosMode chaosMode;

    @RabbitListener(queues = RabbitMqConfig.ORDER_SERVICE_QUEUE)
    @Transactional
    public void handle(
            OrderSagaReplyEvent event,
            @Header(AmqpHeaders.RECEIVED_ROUTING_KEY) String routingKey
    ) {
        if (chaosMode == SagaChaosMode.FORCE_DEAD_LETTER) {
            throw new IllegalStateException(
                    "[SAGA_CHAOS_MODE=FORCE_DEAD_LETTER] Giả lập xử lý thất bại cho sự kiện saga '"
                            + routingKey + "' để đẩy message vào dead-letter queue"
            );
        }

        Order order = orderRepository.findById(event.orderId()).orElse(null);

        if (order == null) {
            log.warn(
                    "Bỏ qua sự kiện saga '{}' cho đơn hàng không tồn tại: {}",
                    routingKey,
                    event.orderId()
            );
            return;
        }

        switch (routingKey) {
            case OrderSagaRoutingKeys.STOCK_RESERVED ->
                    handleStockReserved(order);

            case OrderSagaRoutingKeys.STOCK_RESERVE_REJECTED ->
                    handleStockReserveRejected(order, event);

            case OrderSagaRoutingKeys.PAYMENT_COMPLETED ->
                    handlePaymentCompleted(order, event);

            case OrderSagaRoutingKeys.PAYMENT_FAILED ->
                    handlePaymentFailed(order, event);

            default -> log.warn(
                    "Bỏ qua routing key saga không xác định: {}",
                    routingKey
            );
        }
    }

    private void handleStockReserved(Order order) {
        if (order.getStatus() == OrderStatus.PENDING) {
            order.setStatus(OrderStatus.AWAITING_PAYMENT);

            order.addStatusHistory(
                    OrderStatusHistory.builder()
                            .status(OrderStatus.AWAITING_PAYMENT)
                            .note("Đã giữ hàng thành công, chờ thanh toán")
                            .changedAt(LocalDateTime.now())
                            .build()
            );

            orderRepository.save(order);

            orderSagaLogService.log(
                    order,
                    SagaLogStage.STOCK_RESERVED,
                    SagaLogLevel.INFO,
                    "Đã giữ hàng thành công",
                    SagaLogService.PRODUCT_SERVICE,
                    SagaLogService.ORDER_SERVICE,
                    null,
                    null
            );

            orderSagaEventPublisher.publishPaymentCreateRequested(
                    order.getId(),
                    order.getUserId(),
                    order.getOrderCode(),
                    order.getTotalAmount(),
                    order.getPaymentMethod()
            );

            orderSagaLogService.log(
                    order,
                    SagaLogStage.PAYMENT_CREATE_REQUESTED,
                    SagaLogLevel.INFO,
                    "Đã gửi yêu cầu thanh toán",
                    SagaLogService.ORDER_SERVICE,
                    SagaLogService.PAYMENT_SERVICE,
                    null,
                    null
            );

            return;
        }

        if (order.getStatus() == OrderStatus.CANCELLED) {
            order.setStockReleasePending(true);

            boolean published = orderSagaEventPublisher
                    .publishStockReleaseRequested(
                            order.getId(),
                            order.getItems()
                    );

            if (published) {
                order.setStockReleasePending(false);
            }

            orderRepository.save(order);

            orderSagaLogService.log(
                    order,
                    SagaLogStage.STOCK_RELEASE_REQUESTED,
                    published ? SagaLogLevel.INFO : SagaLogLevel.WARN,
                    published
                            ? "Đã gửi yêu cầu nhả hàng thành công"
                            : "Gửi yêu cầu nhả hàng thất bại, sẽ được thử lại tự động",
                    SagaLogService.ORDER_SERVICE,
                    SagaLogService.PRODUCT_SERVICE,
                    published ? null : "Gửi yêu cầu nhả hàng thất bại",
                    null
            );

            return;
        }

        log.warn(
                "Bỏ qua sự kiện 'stock.reserved' cho đơn hàng {} đang ở trạng thái {}",
                order.getId(),
                order.getStatus()
        );
    }

    private void handleStockReserveRejected(
            Order order,
            OrderSagaReplyEvent event
    ) {
        if (order.getStatus() != OrderStatus.PENDING) {
            log.warn(
                    "Bỏ qua sự kiện 'stock.reserve.rejected' cho đơn hàng {} đang ở trạng thái {}",
                    order.getId(),
                    order.getStatus()
            );
            return;
        }

        order.setStatus(OrderStatus.CANCELLED);

        String reason = event.reason() != null
                ? event.reason()
                : "Không đủ hàng trong kho";

        order.addStatusHistory(
                OrderStatusHistory.builder()
                        .status(OrderStatus.CANCELLED)
                        .note(reason)
                        .changedAt(LocalDateTime.now())
                        .build()
        );

        orderRepository.save(order);

        orderSagaLogService.log(
                order,
                SagaLogStage.STOCK_RESERVE_REJECTED,
                SagaLogLevel.WARN,
                "Giữ hàng thất bại: " + reason,
                SagaLogService.PRODUCT_SERVICE,
                SagaLogService.ORDER_SERVICE,
                reason,
                null
        );
    }

    private void handlePaymentCompleted(
            Order order,
            OrderSagaReplyEvent event
    ) {
        if (order.getStatus() != OrderStatus.AWAITING_PAYMENT) {
            log.warn(
                    "Bỏ qua sự kiện 'payment.completed' cho đơn hàng {} đang ở trạng thái {}",
                    order.getId(),
                    order.getStatus()
            );
            return;
        }

        order.setStatus(OrderStatus.CONFIRMED);
        order.setPaymentStatus(PaymentStatus.PAID);
        order.setPaymentId(event.paymentId());
        order.setTransactionCode(event.transactionCode());

        order.addStatusHistory(
                OrderStatusHistory.builder()
                        .status(OrderStatus.CONFIRMED)
                        .note("Thanh toán thành công")
                        .changedAt(LocalDateTime.now())
                        .build()
        );

        orderRepository.save(order);

        orderSagaLogService.log(
                order,
                SagaLogStage.PAYMENT_COMPLETED,
                SagaLogLevel.INFO,
                "Thanh toán thành công",
                SagaLogService.PAYMENT_SERVICE,
                SagaLogService.ORDER_SERVICE,
                null,
                null
        );

        // Partial checkout (T-checkout-select): checkout() only ever put the selected variants
        // onto this order, so only those should leave the cart — clearCart() would also wipe
        // items the user deliberately left unselected.
        List<UUID> orderedVariantIds = order.getItems().stream()
                .map(OrderItem::getVariantId)
                .collect(Collectors.toList());
        cartService.removeItems(order.getUserId(), orderedVariantIds);
    }

    private void handlePaymentFailed(
            Order order,
            OrderSagaReplyEvent event
    ) {
        if (order.getStatus() != OrderStatus.AWAITING_PAYMENT) {
            log.warn(
                    "Bỏ qua sự kiện 'payment.failed' cho đơn hàng {} đang ở trạng thái {}",
                    order.getId(),
                    order.getStatus()
            );
            return;
        }

        order.setStatus(OrderStatus.CANCELLED);
        order.setPaymentStatus(PaymentStatus.FAILED);

        String reason = event.reason() != null
                ? event.reason()
                : "Thanh toán thất bại";

        order.addStatusHistory(
                OrderStatusHistory.builder()
                        .status(OrderStatus.CANCELLED)
                        .note(reason)
                        .changedAt(LocalDateTime.now())
                        .build()
        );

        orderSagaLogService.log(
                order,
                SagaLogStage.PAYMENT_FAILED,
                SagaLogLevel.WARN,
                "Thanh toán thất bại: " + reason,
                SagaLogService.PAYMENT_SERVICE,
                SagaLogService.ORDER_SERVICE,
                reason,
                null
        );

        order.setStockReleasePending(true);

        boolean published = orderSagaEventPublisher
                .publishStockReleaseRequested(
                        order.getId(),
                        order.getItems()
                );

        if (published) {
            order.setStockReleasePending(false);
        }

        orderRepository.save(order);

        orderSagaLogService.log(
                order,
                SagaLogStage.STOCK_RELEASE_REQUESTED,
                published ? SagaLogLevel.INFO : SagaLogLevel.WARN,
                published
                        ? "Đã gửi yêu cầu nhả hàng thành công"
                        : "Gửi yêu cầu nhả hàng thất bại, sẽ được thử lại tự động",
                SagaLogService.ORDER_SERVICE,
                SagaLogService.PRODUCT_SERVICE,
                published ? null : "Gửi yêu cầu nhả hàng thất bại",
                null
        );
    }
}
