package com.tttn.orderservice.service;

import com.tttn.orderservice.dto.request.CancelOrderRequest;
import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.request.UpdateOrderStatusRequest;
import com.tttn.orderservice.dto.response.AdminOrderSummaryResponse;
import com.tttn.orderservice.dto.response.CheckoutResponse;
import com.tttn.orderservice.dto.response.OrderResponse;
import com.tttn.orderservice.dto.response.OrderSummaryResponse;
import com.tttn.orderservice.enums.OrderStatus;
import org.springframework.data.domain.Page;

import java.util.UUID;

public interface OrderService {

    CheckoutResponse checkout(
            UUID userId,
            CheckoutRequest request
    );

    /**
     * @param page  1-based page number
     * @param limit page size, 1..100
     */
    Page<OrderSummaryResponse> getOrders(
            UUID userId,
            OrderStatus status,
            int page,
            int limit
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

    Page<OrderSummaryResponse> getAllOrders(
            OrderStatus status,
            int page,
            int limit
    );

    OrderResponse getOrderDetailForAdmin(UUID orderId);

    AdminOrderSummaryResponse getOrdersSummary();

    /**
     * True when the user has an order in a paid status (CONFIRMED onwards, not CANCELLED)
     * that contains the product.
     */
    boolean hasPurchased(
            UUID userId,
            UUID productId
    );
}