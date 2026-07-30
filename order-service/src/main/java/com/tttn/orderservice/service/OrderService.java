package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.request.CancelOrderRequest;
import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.request.UpdateOrderStatusRequest;
import com.tttn.orderservice.dto.response.AdminOrderSummaryResponse;
import com.tttn.orderservice.dto.response.CheckoutResponse;
import com.tttn.orderservice.dto.response.OrderResponse;
import com.tttn.orderservice.dto.response.OrderSummaryResponse;
import com.tttn.orderservice.dto.response.PageResponse;
import com.tttn.orderservice.enums.OrderStatus;

import java.util.UUID;

public interface OrderService {

    CheckoutResponse checkout(
            UUID userId,
            CheckoutRequest request
    );

    PageResponse<OrderSummaryResponse> getOrders(
            UUID userId,
            OrderStatus status,
            int page,
            int size
    );

    OrderResponse getOrderDetail(
            UUID userId,
            UUID orderId
    );

    OrderResponse cancelOrder(
            UUID userId,
            UUID orderId,
            CancelOrderRequest request
    );

    OrderResponse updateOrderStatus(
            UUID orderId,
            UUID changedBy,
            UpdateOrderStatusRequest request
    );

    PageResponse<OrderSummaryResponse> getAllOrders(
            OrderStatus status,
            int page,
            int size
    );

    OrderResponse getOrderDetailForAdmin(UUID orderId);

    AdminOrderSummaryResponse getOrdersSummary();
}