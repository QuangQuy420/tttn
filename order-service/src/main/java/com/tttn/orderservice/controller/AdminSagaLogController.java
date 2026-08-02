package com.tttn.orderservice.controller;

import com.tttn.orderservice.dto.response.OrderLogSummaryResponse;
import com.tttn.orderservice.dto.response.OrderSagaLogResponse;
import com.tttn.orderservice.dto.response.SagaLogDayResponse;
import com.tttn.orderservice.service.OrderSagaLogService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * Admin-only read API over the checkout saga's audit trail (FR16) — same "no in-service
 * permission guard" convention as {@link OrderController}'s other {@code /admin/...} routes:
 * permission checking (`order:manage`) happens at api-gateway's {@code PermissionsGuard}, this
 * service trusts the gateway.
 */
@RestController
@RequestMapping("/api/v1/admin/saga-logs")
@RequiredArgsConstructor
public class AdminSagaLogController {

    private final OrderSagaLogService orderSagaLogService;

    @GetMapping("/days")
    public ResponseEntity<List<SagaLogDayResponse>> getLogDays() {
        return ResponseEntity.ok(orderSagaLogService.getLogDays());
    }

    @GetMapping("/days/{date}")
    public ResponseEntity<List<OrderLogSummaryResponse>> getOrdersForDay(
            @PathVariable String date
    ) {
        return ResponseEntity.ok(
                orderSagaLogService.getOrdersForDay(LocalDate.parse(date))
        );
    }

    @GetMapping("/orders/{orderId}")
    public ResponseEntity<List<OrderSagaLogResponse>> getOrderLogs(
            @PathVariable UUID orderId
    ) {
        return ResponseEntity.ok(orderSagaLogService.getOrderLogs(orderId));
    }
}
