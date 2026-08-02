package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.response.OrderLogSummaryResponse;
import com.tttn.orderservice.dto.response.OrderSagaLogResponse;
import com.tttn.orderservice.dto.response.SagaLogDayResponse;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderSagaLog;
import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;
import com.tttn.orderservice.repository.OrderSagaLogRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Writes and reads {@code OrderSagaLog} entries — the admin-facing timeline of every saga
 * milestone for an order (FR14-FR16). {@link #log} is best-effort (FR19/AC15): a failure to
 * write the log entry (e.g. a transient DB error) is only logged, never thrown, so it can never
 * roll back or block the actual checkout/saga-reply flow calling it.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OrderSagaLogService {

    private final OrderSagaLogRepository orderSagaLogRepository;

    public void log(
            Order order,
            SagaLogStage stage,
            SagaLogLevel level,
            String message,
            SagaLogService sourceService,
            SagaLogService targetService,
            String errorDetail,
            Integer retryCount
    ) {
        try {
            OrderSagaLog entry = OrderSagaLog.builder()
                    .order(order)
                    .stage(stage)
                    .level(level)
                    .message(message)
                    .sourceService(sourceService)
                    .targetService(targetService)
                    .errorDetail(errorDetail)
                    .retryCount(retryCount)
                    .build();

            orderSagaLogRepository.save(entry);
        } catch (Exception exception) {
            log.error(
                    "Không thể ghi nhật ký saga (đơn hàng={}, stage={}): {}",
                    order != null ? order.getId() : null,
                    stage,
                    exception.getMessage(),
                    exception
            );
        }
    }

    @Transactional(readOnly = true)
    public List<SagaLogDayResponse> getLogDays() {
        List<LocalDate> dates = orderSagaLogRepository.findDistinctLogDates();

        return dates.stream()
                .map(date -> {
                    List<OrderSagaLog> logsOfDay = logsBetween(date);

                    boolean hasWarning = logsOfDay.stream()
                            .anyMatch(entry -> entry.getLevel() == SagaLogLevel.WARN);

                    return new SagaLogDayResponse(
                            date,
                            logsOfDay.size(),
                            hasWarning
                    );
                })
                .toList();
    }

    @Transactional(readOnly = true)
    public List<OrderLogSummaryResponse> getOrdersForDay(LocalDate date) {
        List<OrderSagaLog> logsOfDay = logsBetween(date);

        Map<UUID, List<OrderSagaLog>> byOrder = logsOfDay.stream()
                .collect(Collectors.groupingBy(entry -> entry.getOrder().getId()));

        return byOrder.values().stream()
                .map(this::toOrderLogSummary)
                .sorted(
                        Comparator.comparing(
                                OrderLogSummaryResponse::lastOccurredAt,
                                Comparator.reverseOrder()
                        )
                )
                .toList();
    }

    @Transactional(readOnly = true)
    public List<OrderSagaLogResponse> getOrderLogs(UUID orderId) {
        return orderSagaLogRepository
                .findByOrderIdOrderByOccurredAtAsc(orderId)
                .stream()
                .map(entry -> new OrderSagaLogResponse(
                        entry.getStage(),
                        entry.getLevel(),
                        entry.getMessage(),
                        entry.getSourceService(),
                        entry.getTargetService(),
                        entry.getErrorDetail(),
                        entry.getRetryCount(),
                        entry.getOccurredAt()
                ))
                .toList();
    }

    private List<OrderSagaLog> logsBetween(LocalDate date) {
        LocalDateTime from = date.atStartOfDay();
        LocalDateTime to = date.plusDays(1).atStartOfDay();

        return orderSagaLogRepository
                .findByOccurredAtBetweenOrderByOccurredAtDesc(from, to);
    }

    private OrderLogSummaryResponse toOrderLogSummary(List<OrderSagaLog> orderLogs) {
        Order order = orderLogs.get(0).getOrder();

        SagaLogLevel worstLevel = orderLogs.stream()
                .anyMatch(entry -> entry.getLevel() == SagaLogLevel.WARN)
                ? SagaLogLevel.WARN
                : SagaLogLevel.INFO;

        LocalDateTime lastOccurredAt = orderLogs.stream()
                .map(OrderSagaLog::getOccurredAt)
                .max(Comparator.naturalOrder())
                .orElse(null);

        return new OrderLogSummaryResponse(
                order.getId(),
                order.getOrderCode(),
                orderLogs.size(),
                worstLevel,
                lastOccurredAt
        );
    }
}
