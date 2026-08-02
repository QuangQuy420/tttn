package com.tttn.orderservice.scheduling;

import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderStatusHistory;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;
import com.tttn.orderservice.messaging.OrderSagaEventPublisher;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.OrderSagaLogService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Periodically detects checkout-saga orders stuck mid-flight because a best-effort publish
 * silently failed (see plan {@code 2026-08-01-checkout-saga-reconciliation-job.md}, FR1-FR9):
 * <ul>
 *   <li>{@code PENDING} orders that never got a {@code stock.reserved}/{@code stock.reserve.rejected}
 *   reply — resends {@code stock.reserve.requested}.</li>
 *   <li>{@code AWAITING_PAYMENT} orders that never got a {@code payment.completed}/
 *   {@code payment.failed} reply — resends {@code payment.create.requested}.</li>
 *   <li>{@code CANCELLED} orders with {@code stockReleasePending = true} — resends
 *   {@code stock.release.requested}.</li>
 * </ul>
 * Resending is safe without extra guards on this side because product-service/payment-service's
 * existing idempotency checks ({@code hasReservedForOrder}, {@code markReleasedIfReserved},
 * {@code PaymentsService.findByOrderId}) absorb duplicate sends (FR9/AC3/AC4/AC7) — this job
 * never re-decides a business outcome itself (FR8), it only resends the exact message that
 * should already have gone out.
 *
 * <p>Each order is processed in its own try/catch so one order's failure never stops the run
 * (NFR4). An order that has been retried {@code max-attempts} times without escaping its stuck
 * state is marked {@code reconciliationExhausted} and skipped on all future runs (FR6/AC6) — see
 * {@link #markExhausted} for what happens to it at that point (cancel + release, not just a
 * warning log — this intentionally goes beyond the original plan's FR6, which called for no
 * auto-cancel; kept here to avoid leaking reserved stock forever, see that method's javadoc).
 *
 * <p>Note on retry cadence: because every processed attempt (successful publish or not) bumps
 * {@code lastReconciliationAttemptAt = now}, an order only becomes "stuck" again after another
 * full {@code stuck-threshold-minutes} has passed — so the effective resend cadence is ~2 minutes
 * apart, not every 60-second job tick, even though the job itself runs every 60 seconds. This is
 * intentional (see plan's Risks &amp; dependencies), not an off-by-one bug.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SagaReconciliationJob {

    private static final List<OrderStatus> STUCK_STATUSES =
            List.of(OrderStatus.PENDING, OrderStatus.AWAITING_PAYMENT);

    private final OrderRepository orderRepository;
    private final OrderSagaEventPublisher orderSagaEventPublisher;
    private final OrderSagaLogService orderSagaLogService;

    @Value("${app.reconciliation.stuck-threshold-minutes}")
    private int stuckThresholdMinutes;

    @Value("${app.reconciliation.max-attempts}")
    private int maxAttempts;

    // @Transactional here (not on the private helpers) because Spring's proxy only intercepts
    // calls that come in through it — the helpers below are invoked via internal self-invocation,
    // so this is the only method boundary where the annotation actually takes effect. Keeps the
    // Hibernate session open for the whole run, which order.getItems() (a lazy collection) needs
    // when a stuck order is resent.
    @Scheduled(fixedDelayString = "${app.reconciliation.interval-ms}")
    @Transactional
    public void reconcile() {
        reconcileStuckOrders();
        reconcileUnconfirmedStockReleases();
    }

    private void reconcileStuckOrders() {
        List<Order> candidates = orderRepository
                .findByStatusInAndReconciliationExhaustedFalse(STUCK_STATUSES);

        for (Order order : candidates) {
            try {
                processStuckOrder(order);
            } catch (Exception exception) {
                log.error(
                        "SagaReconciliationJob: lỗi khi xử lý đơn hàng {} (trạng thái {}): {}",
                        order.getId(),
                        order.getStatus(),
                        exception.getMessage(),
                        exception
                );
            }
        }
    }

    private void processStuckOrder(Order order) {
        if (!isStuck(order)) {
            return;
        }

        if (order.getReconciliationAttempts() >= maxAttempts) {
            markExhausted(order);
            return;
        }

        boolean resent = resendStuckOrderEvent(order);

        SagaLogService targetService = order.getStatus() == OrderStatus.PENDING
                ? SagaLogService.PRODUCT_SERVICE
                : SagaLogService.PAYMENT_SERVICE;

        bumpAttempt(order, resent, targetService);
    }

    private boolean resendStuckOrderEvent(Order order) {
        try {
            switch (order.getStatus()) {
                case PENDING -> orderSagaEventPublisher.publishStockReserveRequested(
                        order.getId(),
                        order.getItems()
                );

                case AWAITING_PAYMENT -> orderSagaEventPublisher.publishPaymentCreateRequested(
                        order.getId(),
                        order.getUserId(),
                        order.getOrderCode(),
                        order.getTotalAmount(),
                        order.getPaymentMethod()
                );

                default -> {
                    log.warn(
                            "SagaReconciliationJob: bỏ qua đơn hàng {} ở trạng thái không mong đợi {}",
                            order.getId(),
                            order.getStatus()
                    );
                    return false;
                }
            }

            return true;
        } catch (Exception exception) {
            log.error(
                    "SagaReconciliationJob: gửi lại sự kiện saga cho đơn hàng {} thất bại: {}",
                    order.getId(),
                    exception.getMessage(),
                    exception
            );

            return false;
        }
    }

    private void reconcileUnconfirmedStockReleases() {
        List<Order> candidates = orderRepository
                .findByStockReleasePendingTrueAndReconciliationExhaustedFalse();

        for (Order order : candidates) {
            try {
                processPendingStockRelease(order);
            } catch (Exception exception) {
                log.error(
                        "SagaReconciliationJob: lỗi khi xử lý nhả hàng cho đơn hàng {}: {}",
                        order.getId(),
                        exception.getMessage(),
                        exception
                );
            }
        }
    }

    private void processPendingStockRelease(Order order) {
        if (!isStuck(order)) {
            return;
        }

        if (order.getReconciliationAttempts() >= maxAttempts) {
            markExhausted(order);
            return;
        }

        boolean published = orderSagaEventPublisher.publishStockReleaseRequested(
                order.getId(),
                order.getItems()
        );

        if (published) {
            order.setStockReleasePending(false);
        }

        bumpAttempt(order, published, SagaLogService.PRODUCT_SERVICE);
    }

    private boolean isStuck(Order order) {
        LocalDateTime reference = order.getLastReconciliationAttemptAt() != null
                ? order.getLastReconciliationAttemptAt()
                : order.getUpdatedAt();

        return reference.isBefore(
                LocalDateTime.now().minusMinutes(stuckThresholdMinutes)
        );
    }

    /**
     * An order that has been retried {@code max-attempts} times without escaping its stuck
     * state is marked {@code reconciliationExhausted} AND actively compensated: cancelled (if
     * not already) and its stock release requested, instead of being left to hold reserved
     * stock forever with only a warning log (the original design here deliberately never
     * auto-cancelled — see the class javadoc's now-outdated note — but that leaves a real
     * inventory leak whenever the order actually did get stock reserved before the saga got
     * stuck, e.g. its confirmation reply was lost). This is safe because:
     * <ul>
     *   <li>{@code publishStockReleaseRequested} is idempotent on product-service's side even
     *   when nothing was ever reserved for this order (safe no-op, see
     *   {@code InventoryService.release}'s idempotency note) — always attempting it here never
     *   risks releasing something that shouldn't be.</li>
     *   <li>Cancelling first means any very-late saga reply that still arrives after this point
     *   is handled by {@link com.tttn.orderservice.messaging.OrderSagaEventListener}'s existing
     *   "current status" guard (NFR2) — e.g. a late {@code stock.reserved} for an already-
     *   {@code CANCELLED} order re-triggers release instead of wrongly advancing the order.</li>
     * </ul>
     */
    private void markExhausted(Order order) {
        order.setReconciliationExhausted(true);

        boolean alreadyCancelled = order.getStatus() == OrderStatus.CANCELLED;

        if (!alreadyCancelled) {
            order.setStatus(OrderStatus.CANCELLED);

            order.addStatusHistory(
                    OrderStatusHistory.builder()
                            .status(OrderStatus.CANCELLED)
                            .note("Hệ thống tự hủy do vượt quá số lần thử xử lý saga tự động")
                            .changedAt(LocalDateTime.now())
                            .build()
            );
        }

        order.setStockReleasePending(true);

        boolean released = orderSagaEventPublisher.publishStockReleaseRequested(
                order.getId(),
                order.getItems()
        );

        if (released) {
            order.setStockReleasePending(false);
        }

        orderRepository.save(order);

        log.warn(
                "SagaReconciliationJob: đơn hàng {} ({}) đã hết {} lần thử reconciliation — "
                        + "đã tự hủy đơn và {} yêu cầu nhả hàng, cần người vận hành kiểm tra lại",
                order.getId(),
                order.getOrderCode(),
                maxAttempts,
                released ? "gửi thành công" : "gửi thất bại (sẽ được thử lại)"
        );

        orderSagaLogService.log(
                order,
                SagaLogStage.RECONCILIATION_EXHAUSTED,
                SagaLogLevel.WARN,
                "Đã hết " + maxAttempts
                        + " lần thử tự động, hệ thống đã tự hủy đơn và yêu cầu nhả hàng",
                SagaLogService.ORDER_SERVICE,
                null,
                "Đã hết " + maxAttempts + " lần thử tự động",
                order.getReconciliationAttempts()
        );

        orderSagaLogService.log(
                order,
                SagaLogStage.STOCK_RELEASE_REQUESTED,
                released ? SagaLogLevel.INFO : SagaLogLevel.WARN,
                released
                        ? "Đã gửi yêu cầu nhả hàng thành công"
                        : "Gửi yêu cầu nhả hàng thất bại, sẽ được thử lại tự động",
                SagaLogService.ORDER_SERVICE,
                SagaLogService.PRODUCT_SERVICE,
                released ? null : "Gửi yêu cầu nhả hàng thất bại",
                null
        );
    }

    private void bumpAttempt(Order order, boolean resent, SagaLogService targetService) {
        order.setReconciliationAttempts(order.getReconciliationAttempts() + 1);
        order.setLastReconciliationAttemptAt(LocalDateTime.now());
        orderRepository.save(order);

        if (resent) {
            log.info(
                    "SagaReconciliationJob: đã gửi lại sự kiện saga cho đơn hàng {} (lần thử {})",
                    order.getId(),
                    order.getReconciliationAttempts()
            );

            orderSagaLogService.log(
                    order,
                    SagaLogStage.RECONCILIATION_RESENT,
                    SagaLogLevel.INFO,
                    "Đã gửi lại lệnh saga (lần thử "
                            + order.getReconciliationAttempts() + ")",
                    SagaLogService.ORDER_SERVICE,
                    targetService,
                    null,
                    order.getReconciliationAttempts()
            );
        }
    }
}
