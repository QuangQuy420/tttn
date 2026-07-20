package com.tttn.orderservice.mapper;

import com.tttn.orderservice.dto.response.OrderItemResponse;
import com.tttn.orderservice.dto.response.OrderResponse;
import com.tttn.orderservice.dto.response.OrderStatusHistoryResponse;
import com.tttn.orderservice.dto.response.OrderSummaryResponse;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.entity.OrderStatusHistory;
import org.springframework.stereotype.Component;

import java.util.List;

@Component
public class OrderMapper {

    public OrderResponse toResponse(Order order) {
        List<OrderItemResponse> items = order.getItems()
                .stream()
                .map(this::toItemResponse)
                .toList();

        List<OrderStatusHistoryResponse> histories =
                order.getStatusHistories()
                        .stream()
                        .map(this::toStatusHistoryResponse)
                        .toList();

        return new OrderResponse(
                order.getId(),
                order.getOrderCode(),
                order.getUserId(),
                order.getTotalAmount(),
                order.getStatus(),
                order.getPaymentId(),
                order.getPaymentMethod(),
                order.getPaymentStatus(),
                order.getReceiverName(),
                order.getReceiverPhone(),
                order.getShippingAddress(),
                order.getNote(),
                items,
                histories,
                order.getCreatedAt(),
                order.getUpdatedAt()
        );
    }

    public OrderSummaryResponse toSummaryResponse(Order order) {
        return new OrderSummaryResponse(
                order.getId(),
                order.getOrderCode(),
                order.getTotalAmount(),
                order.getStatus(),
                order.getPaymentMethod(),
                order.getPaymentStatus(),
                order.getReceiverName(),
                order.getReceiverPhone(),
                order.getCreatedAt()
        );
    }

    public OrderItemResponse toItemResponse(OrderItem item) {
        return new OrderItemResponse(
                item.getId(),
                item.getProductId(),
                item.getVariantId(),
                item.getProductName(),
                item.getSkuVariant(),
                item.getColor(),
                item.getSize(),
                item.getProductImageUrl(),
                item.getUnitPrice(),
                item.getQuantity(),
                item.getSubtotal()
        );
    }

    public OrderStatusHistoryResponse toStatusHistoryResponse(
            OrderStatusHistory history
    ) {
        return new OrderStatusHistoryResponse(
                history.getId(),
                history.getStatus(),
                history.getChangedBy(),
                history.getNote(),
                history.getChangedAt()
        );
    }
}