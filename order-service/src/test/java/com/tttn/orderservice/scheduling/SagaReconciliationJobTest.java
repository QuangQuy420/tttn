package com.tttn.orderservice.scheduling;

import com.tttn.orderservice.dto.response.ReconciliationSettingsResponse;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.OutboxStatus;
import com.tttn.orderservice.messaging.OrderSagaEventPublisher;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.repository.OutboxEventRepository;
import com.tttn.orderservice.service.OrderSagaLogService;
import com.tttn.orderservice.service.ReconciliationSettingsService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("SagaReconciliationJob - bỏ qua đơn còn sự kiện outbox PENDING")
class SagaReconciliationJobTest {

    private static final int MAX_ATTEMPTS = 3;

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderSagaEventPublisher orderSagaEventPublisher;

    @Mock
    private OrderSagaLogService orderSagaLogService;

    @Mock
    private ReconciliationSettingsService reconciliationSettingsService;

    @Mock
    private OutboxEventRepository outboxEventRepository;

    private SagaReconciliationJob job;

    @BeforeEach
    void setUp() {
        job = new SagaReconciliationJob(
                orderRepository,
                orderSagaEventPublisher,
                orderSagaLogService,
                reconciliationSettingsService,
                outboxEventRepository
        );

        when(reconciliationSettingsService.get()).thenReturn(
                new ReconciliationSettingsResponse(60000, 1, MAX_ATTEMPTS, null, null)
        );
    }

    @Test
    @DisplayName("Đơn kẹt nhưng còn outbox PENDING (broker chết) → không gửi lại, không tăng lần thử, không tự huỷ")
    void reconcile_WhenOrderHasPendingOutboxEvent_ShouldSkipIt() {
        // Already at max attempts: without the outbox check this order would be auto-cancelled.
        Order order = stuckPendingOrder(MAX_ATTEMPTS);

        when(orderRepository.findByStatusInAndReconciliationExhaustedFalse(anyList()))
                .thenReturn(List.of(order));
        when(outboxEventRepository.existsByAggregateIdAndStatus(order.getId(), OutboxStatus.PENDING))
                .thenReturn(true);

        job.reconcile();

        assertEquals(OrderStatus.PENDING, order.getStatus());
        assertFalse(order.isReconciliationExhausted());
        assertEquals(MAX_ATTEMPTS, order.getReconciliationAttempts());

        verifyNoInteractions(orderSagaEventPublisher, orderSagaLogService);
        verify(orderRepository, never()).save(any(Order.class));
    }

    @Test
    @DisplayName("Đơn kẹt và không còn outbox PENDING → vẫn gửi lại như cũ")
    void reconcile_WhenOrderHasNoPendingOutboxEvent_ShouldResend() {
        Order order = stuckPendingOrder(0);

        when(orderRepository.findByStatusInAndReconciliationExhaustedFalse(anyList()))
                .thenReturn(List.of(order));
        when(outboxEventRepository.existsByAggregateIdAndStatus(order.getId(), OutboxStatus.PENDING))
                .thenReturn(false);

        job.reconcile();

        verify(orderSagaEventPublisher)
                .publishStockReserveRequested(order.getId(), order.getItems());
        assertEquals(1, order.getReconciliationAttempts());
    }

    private Order stuckPendingOrder(int reconciliationAttempts) {
        return Order.builder()
                .id(UUID.randomUUID())
                .orderCode("ORD-20260929-001")
                .status(OrderStatus.PENDING)
                .updatedAt(LocalDateTime.now().minusMinutes(30))
                .reconciliationAttempts(reconciliationAttempts)
                .build();
    }
}
