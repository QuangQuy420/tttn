package com.tttn.orderservice.controller;

import com.tttn.orderservice.dto.request.CancelOrderRequest;
import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.request.UpdateOrderStatusRequest;
import com.tttn.orderservice.dto.response.*;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.service.OrderService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
@RequiredArgsConstructor
public class OrderController {

    private final OrderService orderService;

    @PostMapping("/users/{userId}/checkout")
    public ResponseEntity<CheckoutResponse> checkout(
            @PathVariable UUID userId,
            @Valid @RequestBody CheckoutRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(orderService.checkout(userId, request));
    }

    @GetMapping("/users/{userId}/orders")
    public ResponseEntity<PageResponse<OrderSummaryResponse>>
    getOrders(
            @PathVariable UUID userId,
            @RequestParam(required = false)
            OrderStatus status,
            @RequestParam(defaultValue = "0")
            int page,
            @RequestParam(defaultValue = "20")
            int size
    ) {
        return ResponseEntity.ok(
                orderService.getOrders(
                        userId,
                        status,
                        page,
                        size
                )
        );
    }

    @GetMapping("/users/{userId}/orders/{orderId}")
    public ResponseEntity<OrderResponse> getOrderDetail(
            @PathVariable UUID userId,
            @PathVariable UUID orderId
    ) {
        return ResponseEntity.ok(
                orderService.getOrderDetail(
                        userId,
                        orderId
                )
        );
    }

    @PostMapping("/users/{userId}/orders/{orderId}/cancel")
    public ResponseEntity<OrderResponse> cancelOrder(
            @PathVariable UUID userId,
            @PathVariable UUID orderId,
            @Valid @RequestBody CancelOrderRequest request
    ) {
        return ResponseEntity.ok(
                orderService.cancelOrder(
                        userId,
                        orderId,
                        request
                )
        );
    }

    @PatchMapping("/admin/orders/{orderId}/status")
    public ResponseEntity<OrderResponse> updateStatus(
            @PathVariable UUID orderId,
            @RequestHeader("X-User-Id")
            UUID changedBy,
            @Valid @RequestBody
            UpdateOrderStatusRequest request
    ) {
        return ResponseEntity.ok(
                orderService.updateOrderStatus(
                        orderId,
                        changedBy,
                        request
                )
        );
    }
}