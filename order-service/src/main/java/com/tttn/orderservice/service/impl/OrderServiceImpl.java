package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.PaymentClient;
import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.request.CancelOrderRequest;
import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.request.UpdateOrderStatusRequest;
import com.tttn.orderservice.dto.response.*;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.entity.OrderStatusHistory;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.mapper.OrderMapper;
import com.tttn.orderservice.model.cart.Cart;
import com.tttn.orderservice.model.cart.CartItem;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.CartService;
import com.tttn.orderservice.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;
    private final CartService cartService;
    private final ProductClient productClient;
    private final PaymentClient paymentClient;
    private final OrderMapper orderMapper;

    @Override
    @Transactional
    public CheckoutResponse checkout(
            UUID userId,
            CheckoutRequest request
    ) {
        Cart cart = cartService.getCartEntity(userId);

        if (cart == null || cart.isEmpty()) {
            throw new BadRequestException("Giỏ hàng đang trống");
        }

        Order order = Order.builder()
                .orderCode(generateOrderCode())
                .userId(userId)
                .receiverName(request.receiverName())
                .receiverPhone(request.receiverPhone())
                .shippingAddress(request.shippingAddress())
                .note(request.note())
                .paymentMethod(request.paymentMethod())
                .status(OrderStatus.PENDING)
                .paymentStatus(PaymentStatus.UNPAID)
                .totalAmount(BigDecimal.ZERO)
                .build();

        BigDecimal totalAmount = BigDecimal.ZERO;

        for (CartItem cartItem : cart.getItems()) {
            ProductResponse product =
                    productClient.getProductById(cartItem.getProductId());

            ProductVariantResponse variant = product.variants()
                    .stream()
                    .filter(item ->
                            item.id().equals(cartItem.getVariantId())
                    )
                    .findFirst()
                    .orElseThrow(() ->
                            new ResourceNotFoundException(
                                    "Không tìm thấy biến thể sản phẩm"
                            )
                    );

            BigDecimal unitPrice = product.basePrice()
                    .add(
                            variant.extraPrice() == null
                                    ? BigDecimal.ZERO
                                    : variant.extraPrice()
                    );

            OrderItem orderItem = OrderItem.builder()
                    .productId(product.id())
                    .variantId(variant.id())
                    .productName(product.name())
                    .skuVariant(variant.skuVariant())
                    .color(variant.color())
                    .size(variant.size())
                    .productImageUrl(cartItem.getProductImageUrl())
                    .unitPrice(unitPrice)
                    .quantity(cartItem.getQuantity())
                    .subtotal(
                            unitPrice.multiply(
                                    BigDecimal.valueOf(
                                            cartItem.getQuantity()
                                    )
                            )
                    )
                    .build();

            order.addItem(orderItem);
            totalAmount = totalAmount.add(
                    orderItem.getSubtotal()
            );
        }

        order.setTotalAmount(totalAmount);

        OrderStatusHistory history =
                OrderStatusHistory.builder()
                        .status(OrderStatus.PENDING)
                        .changedBy(userId)
                        .note("Đơn hàng được tạo")
                        .changedAt(LocalDateTime.now())
                        .build();

        order.addStatusHistory(history);

        Order savedOrder = orderRepository.save(order);

        PaymentCreationResponse payment =
                paymentClient.createPayment(
                        savedOrder.getId(),
                        userId,
                        savedOrder.getOrderCode(),
                        savedOrder.getTotalAmount(),
                        savedOrder.getPaymentMethod()
                );

        savedOrder.setPaymentId(payment.paymentId());
        savedOrder.setPaymentStatus(payment.status());

        orderRepository.save(savedOrder);
        cartService.clearCart(userId);

        return new CheckoutResponse(
                savedOrder.getId(),
                savedOrder.getOrderCode(),
                savedOrder.getTotalAmount(),
                savedOrder.getStatus(),
                savedOrder.getPaymentId(),
                savedOrder.getPaymentStatus(),
                payment.paymentUrl()
        );
    }

    @Override
    @Transactional(readOnly = true)
    public PageResponse<OrderSummaryResponse> getOrders(
            UUID userId,
            OrderStatus status,
            int page,
            int size
    ) {
        if (page < 0) {
            throw new BadRequestException(
                    "Trang không được nhỏ hơn 0"
            );
        }

        if (size < 1 || size > 100) {
            throw new BadRequestException(
                    "Kích thước trang phải từ 1 đến 100"
            );
        }

        PageRequest pageable = PageRequest.of(
                page,
                size,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        Page<OrderSummaryResponse> result;

        if (status == null) {
            result = orderRepository
                    .findAllByUserId(userId, pageable)
                    .map(orderMapper::toSummaryResponse);
        } else {
            result = orderRepository
                    .findAllByUserIdAndStatus(
                            userId,
                            status,
                            pageable
                    )
                    .map(orderMapper::toSummaryResponse);
        }

        return PageResponse.from(result);
    }

    @Override
    @Transactional(readOnly = true)
    public OrderResponse getOrderDetail(
            UUID userId,
            UUID orderId
    ) {
        Order order = orderRepository
                .findByIdAndUserId(orderId, userId)
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Không tìm thấy đơn hàng"
                        )
                );

        return orderMapper.toResponse(order);
    }

    @Override
    @Transactional
    public OrderResponse cancelOrder(
            UUID userId,
            UUID orderId,
            CancelOrderRequest request
    ) {
        Order order = orderRepository
                .findByIdAndUserId(orderId, userId)
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Không tìm thấy đơn hàng"
                        )
                );

        Set<OrderStatus> cancellableStatuses =
                EnumSet.of(
                        OrderStatus.PENDING,
                        OrderStatus.CONFIRMED
                );

        if (!cancellableStatuses.contains(order.getStatus())) {
            throw new BadRequestException(
                    "Không thể hủy đơn ở trạng thái "
                            + order.getStatus()
            );
        }

        order.setStatus(OrderStatus.CANCELLED);

        order.addStatusHistory(
                OrderStatusHistory.builder()
                        .status(OrderStatus.CANCELLED)
                        .changedBy(userId)
                        .note(request.reason())
                        .build()
        );

        return orderMapper.toResponse(
                orderRepository.save(order)
        );
    }

    @Override
    @Transactional
    public OrderResponse updateOrderStatus(
            UUID orderId,
            UUID changedBy,
            UpdateOrderStatusRequest request
    ) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Không tìm thấy đơn hàng"
                        )
                );

        validateStatusTransition(
                order.getStatus(),
                request.status()
        );

        order.setStatus(request.status());

        order.addStatusHistory(
                OrderStatusHistory.builder()
                        .status(request.status())
                        .changedBy(changedBy)
                        .note(request.note())
                        .build()
        );

        return orderMapper.toResponse(
                orderRepository.save(order)
        );
    }

    private void validateStatusTransition(
            OrderStatus current,
            OrderStatus target
    ) {
        boolean valid = switch (current) {
            case PENDING ->
                    target == OrderStatus.CONFIRMED
                            || target == OrderStatus.CANCELLED;

            case CONFIRMED ->
                    target == OrderStatus.PROCESSING
                            || target == OrderStatus.CANCELLED;

            case PROCESSING ->
                    target == OrderStatus.SHIPPING;

            case SHIPPING ->
                    target == OrderStatus.DELIVERED;

            case DELIVERED ->
                    target == OrderStatus.COMPLETED;

            case COMPLETED, CANCELLED -> false;
        };

        if (!valid) {
            throw new BadRequestException(
                    "Không thể chuyển trạng thái từ "
                            + current
                            + " sang "
                            + target
            );
        }
    }

    private String generateOrderCode() {
        return "ORD-"
                + System.currentTimeMillis()
                + "-"
                + UUID.randomUUID()
                .toString()
                .substring(0, 6)
                .toUpperCase();
    }
}