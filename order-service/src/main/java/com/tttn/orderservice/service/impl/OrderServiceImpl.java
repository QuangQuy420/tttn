package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.request.CancelOrderRequest;
import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.request.UpdateOrderStatusRequest;
import com.tttn.orderservice.dto.response.*;
import com.tttn.orderservice.entity.CheckoutIdempotencyKey;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.entity.OrderStatusHistory;
import com.tttn.orderservice.enums.CartItemUnavailableReason;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.enums.SagaLogLevel;
import com.tttn.orderservice.enums.SagaLogService;
import com.tttn.orderservice.enums.SagaLogStage;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.CartChangedException;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.mapper.OrderMapper;
import com.tttn.orderservice.messaging.OrderSagaEventPublisher;
import com.tttn.orderservice.model.cart.Cart;
import com.tttn.orderservice.model.cart.CartItem;
import com.tttn.orderservice.repository.CheckoutIdempotencyKeyRepository;
import com.tttn.orderservice.repository.OrderItemRepository;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.CartService;
import com.tttn.orderservice.service.OrderSagaLogService;
import com.tttn.orderservice.service.OrderService;
import com.tttn.orderservice.util.PageRequests;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OrderServiceImpl implements OrderService {

    // Order statuses that count as "purchased" (paid): used to allow product reviews.
    private static final Set<OrderStatus> PURCHASED_STATUSES = EnumSet.of(
            OrderStatus.CONFIRMED,
            OrderStatus.PROCESSING,
            OrderStatus.SHIPPING,
            OrderStatus.DELIVERED,
            OrderStatus.COMPLETED
    );

    // Idempotency keys are replayable for 24h (AC4).
    private static final long IDEMPOTENCY_KEY_TTL_HOURS = 24;

    private final OrderRepository orderRepository;
    private final OrderItemRepository orderItemRepository;
    private final CartService cartService;
    private final ProductClient productClient;
    private final OrderSagaEventPublisher orderSagaEventPublisher;
    private final OrderMapper orderMapper;
    private final OrderSagaLogService orderSagaLogService;
    private final CheckoutIdempotencyKeyRepository checkoutIdempotencyKeyRepository;
    private final JsonMapper jsonMapper;

    // @Transactional here too: the call below is a self-invocation, so it would not start a
    // transaction on its own.
    @Override
    @Transactional
    public CheckoutResponse checkout(
            UUID userId,
            CheckoutRequest request
    ) {
        return checkout(userId, request, null, null);
    }

    @Override
    @Transactional
    public CheckoutResponse checkout(
            UUID userId,
            CheckoutRequest request,
            String idempotencyKey,
            String requestHash
    ) {
        Cart cart = cartService.getCartEntity(userId);

        if (cart == null || cart.isEmpty()) {
            throw new BadRequestException("Giỏ hàng đang trống");
        }

        // Partial checkout (T-checkout-select): only the variants the client selected become
        // this order — everything else stays in the cart. `@NotEmpty` on the DTO already
        // rejects an empty selection; this also catches a selected id that isn't actually in
        // the cart anymore (e.g. removed in another tab).
        Set<UUID> selectedVariantIds = new HashSet<>(request.variantIds());
        List<CartItem> selectedItems = cart.getItems().stream()
                .filter(item -> selectedVariantIds.contains(item.getVariantId()))
                .collect(Collectors.toList());

        Set<UUID> foundVariantIds = selectedItems.stream()
                .map(CartItem::getVariantId)
                .collect(Collectors.toSet());
        if (!foundVariantIds.equals(selectedVariantIds)) {
            throw new BadRequestException(
                    "Một số sản phẩm đã chọn không có trong giỏ hàng"
            );
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

        // Cart guard (AC14): the user must see the price/availability they are paying for.
        // Every selected item is checked against product-service before anything is created;
        // all mismatches are collected so the client gets them in one 409.
        List<CartChangedItemResponse> changedItems = new ArrayList<>();
        Map<UUID, BigDecimal> expectedUnitPrices =
                request.expectedUnitPrices() == null
                        ? Map.of()
                        : request.expectedUnitPrices();

        for (CartItem cartItem : selectedItems) {
            ProductResponse product =
                    fetchProductOrNull(cartItem.getProductId());

            ProductVariantResponse variant =
                    findVariantOrNull(product, cartItem.getVariantId());

            CartItemUnavailableReason unavailableReason =
                    CartItemUnavailableReason.resolve(
                            product,
                            variant,
                            cartItem.getQuantity()
                    );

            BigDecimal unitPrice = variant == null
                    ? null
                    : Objects.requireNonNullElse(
                            product.basePrice(),
                            BigDecimal.ZERO
                    )
                    .add(
                            variant.extraPrice() == null
                                    ? BigDecimal.ZERO
                                    : variant.extraPrice()
                    );

            BigDecimal expectedUnitPrice = Objects.requireNonNullElse(
                    expectedUnitPrices.get(cartItem.getVariantId()),
                    cartItem.getUnitPrice()
            );

            boolean priceChanged = unitPrice != null
                    && (expectedUnitPrice == null
                    || expectedUnitPrice.compareTo(unitPrice) != 0);

            if (unavailableReason != null || priceChanged) {
                changedItems.add(
                        new CartChangedItemResponse(
                                cartItem.getProductId(),
                                cartItem.getVariantId(),
                                cartItem.getProductName(),
                                expectedUnitPrice,
                                unitPrice,
                                unavailableReason == null,
                                unavailableReason
                        )
                );
                continue;
            }

            OrderItem orderItem = OrderItem.builder()
                    .productId(product.id())
                    .variantId(variant.id())
                    .productName(product.name())
                    .skuVariant(variant.skuVariant())
                    .color(variant.color())
                    .colorHex(variant.colorHex())
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

        if (!changedItems.isEmpty()) {
            // Persist the fresh snapshot so the client sees the new state on reload. Redis is
            // outside the DB transaction, so this survives the rollback triggered below.
            try {
                cartService.refreshCart(userId);
            } catch (RuntimeException exception) {
                // The 409 is the important answer; a failed refresh must not turn it into 502.
                log.warn(
                        "Không thể làm mới giỏ hàng của người dùng {} sau khi phát hiện thay đổi: {}",
                        userId,
                        exception.getMessage()
                );
            }

            throw new CartChangedException(changedItems);
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

        orderSagaLogService.log(
                savedOrder,
                SagaLogStage.CREATED,
                SagaLogLevel.INFO,
                "Đơn hàng được tạo",
                SagaLogService.ORDER_SERVICE,
                null,
                null,
                null
        );

        orderSagaEventPublisher.publishStockReserveRequested(
                savedOrder.getId(),
                savedOrder.getItems()
        );

        orderSagaLogService.log(
                savedOrder,
                SagaLogStage.STOCK_RESERVE_REQUESTED,
                SagaLogLevel.INFO,
                "Đã gửi yêu cầu giữ hàng",
                SagaLogService.ORDER_SERVICE,
                SagaLogService.PRODUCT_SERVICE,
                null,
                null
        );

        CheckoutResponse response = new CheckoutResponse(
                savedOrder.getId(),
                savedOrder.getOrderCode(),
                savedOrder.getTotalAmount(),
                savedOrder.getStatus(),
                savedOrder.getPaymentId(),
                savedOrder.getPaymentStatus(),
                null
        );

        if (idempotencyKey != null) {
            saveIdempotencyKey(userId, idempotencyKey, requestHash, response);
        }

        return response;
    }

    // saveAndFlush (not save) so a concurrent request with the same key hits the UNIQUE
    // (user_id, idempotency_key) index here — Postgres blocks it until the winner commits, then
    // fails it — and the loser's order + outbox rows roll back with this transaction.
    private void saveIdempotencyKey(
            UUID userId,
            String idempotencyKey,
            String requestHash,
            CheckoutResponse response
    ) {
        LocalDateTime now = LocalDateTime.now();

        CheckoutIdempotencyKey key = CheckoutIdempotencyKey.builder()
                .userId(userId)
                .idempotencyKey(idempotencyKey)
                .requestHash(requestHash)
                .orderId(response.orderId())
                .responseBody(jsonMapper.writeValueAsString(response))
                .createdAt(now)
                .expiresAt(now.plusHours(IDEMPOTENCY_KEY_TTL_HOURS))
                .build();

        checkoutIdempotencyKeyRepository.saveAndFlush(key);
    }

    @Override
    @Transactional(readOnly = true)
    public Page<OrderSummaryResponse> getOrders(
            UUID userId,
            OrderStatus status,
            int page,
            int limit
    ) {
        PageRequest pageable = PageRequests.of(
                page,
                limit,
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

        return result;
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
                        OrderStatus.AWAITING_PAYMENT,
                        OrderStatus.CONFIRMED
                );

        if (!cancellableStatuses.contains(order.getStatus())) {
            throw new BadRequestException(
                    "Không thể hủy đơn ở trạng thái "
                            + order.getStatus()
            );
        }

        OrderStatus previousStatus = order.getStatus();
        boolean wasAwaitingPayment =
                previousStatus == OrderStatus.AWAITING_PAYMENT;

        // PENDING is included too, not just AWAITING_PAYMENT: product-service may have already
        // reserved stock and replied 'stock.reserved' before order-service could process that
        // reply (e.g. the reply got lost/dead-lettered) — order.status would still read PENDING
        // even though a real reservation exists downstream. Releasing here is always safe even
        // when nothing was actually reserved (product-service's release is a no-op in that case,
        // see InventoryService.release's idempotency note) — CONFIRMED is deliberately excluded,
        // matching the plan's "no refund logic" scope for cancelling an already-paid order.
        boolean shouldReleaseStock =
                wasAwaitingPayment || previousStatus == OrderStatus.PENDING;

        order.setStatus(OrderStatus.CANCELLED);

        order.addStatusHistory(
                OrderStatusHistory.builder()
                        .status(OrderStatus.CANCELLED)
                        .changedBy(userId)
                        .note(request.reason())
                        .build()
        );

        if (shouldReleaseStock) {
            order.setStockReleasePending(true);

            boolean published = orderSagaEventPublisher
                    .publishStockReleaseRequested(
                            order.getId(),
                            order.getItems()
                    );

            if (published) {
                order.setStockReleasePending(false);
            }

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

    @Override
    @Transactional(readOnly = true)
    public Page<OrderSummaryResponse> getAllOrders(
            OrderStatus status,
            int page,
            int limit
    ) {
        PageRequest pageable = PageRequests.of(
                page,
                limit,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        Page<OrderSummaryResponse> result;

        if (status == null) {
            result = orderRepository
                    .findAll(pageable)
                    .map(orderMapper::toSummaryResponse);
        } else {
            result = orderRepository
                    .findAllByStatus(status, pageable)
                    .map(orderMapper::toSummaryResponse);
        }

        return result;
    }

    @Override
    @Transactional(readOnly = true)
    public OrderResponse getOrderDetailForAdmin(UUID orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() ->
                        new ResourceNotFoundException(
                                "Không tìm thấy đơn hàng"
                        )
                );

        return orderMapper.toResponse(order);
    }

    @Override
    @Transactional(readOnly = true)
    public AdminOrderSummaryResponse getOrdersSummary() {
        Map<OrderStatus, Long> ordersByStatus =
                new EnumMap<>(OrderStatus.class);

        for (Object[] row : orderRepository.countOrdersGroupedByStatus()) {
            ordersByStatus.put(
                    (OrderStatus) row[0],
                    (Long) row[1]
            );
        }

        return new AdminOrderSummaryResponse(
                orderRepository.count(),
                ordersByStatus
        );
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasPurchased(
            UUID userId,
            UUID productId
    ) {
        return orderItemRepository.existsPurchased(
                userId,
                productId,
                PURCHASED_STATUSES
        );
    }

    private void validateStatusTransition(
            OrderStatus current,
            OrderStatus target
    ) {
        boolean valid = switch (current) {
            case PENDING ->
                    target == OrderStatus.AWAITING_PAYMENT
                            || target == OrderStatus.CANCELLED;

            case AWAITING_PAYMENT ->
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

    private ProductResponse fetchProductOrNull(UUID productId) {
        try {
            return productClient.getProductById(productId);
        } catch (ResourceNotFoundException exception) {
            return null;
        }
    }

    private ProductVariantResponse findVariantOrNull(
            ProductResponse product,
            UUID variantId
    ) {
        if (product == null || product.variants() == null) {
            return null;
        }

        return product.variants()
                .stream()
                .filter(item -> Objects.equals(item.id(), variantId))
                .findFirst()
                .orElse(null);
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