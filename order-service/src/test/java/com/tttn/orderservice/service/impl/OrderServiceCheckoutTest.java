package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.response.CheckoutResponse;
import com.tttn.orderservice.dto.response.ProductResponse;
import com.tttn.orderservice.dto.response.ProductVariantResponse;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.ExternalServiceException;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.mapper.OrderMapper;
import com.tttn.orderservice.messaging.OrderSagaEventPublisher;
import com.tttn.orderservice.model.cart.Cart;
import com.tttn.orderservice.model.cart.CartItem;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.CartService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderServiceImpl - checkout")
class OrderServiceCheckoutTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private CartService cartService;

    @Mock
    private ProductClient productClient;

    @Mock
    private OrderSagaEventPublisher orderSagaEventPublisher;

    @Mock
    private OrderMapper orderMapper;

    private OrderServiceImpl orderService;

    private UUID userId;
    private UUID productId;
    private UUID variantId;

    private CheckoutRequest checkoutRequest;

    @BeforeEach
    void setUp() {
        orderService = new OrderServiceImpl(
                orderRepository,
                cartService,
                productClient,
                orderSagaEventPublisher,
                orderMapper
        );

        userId = UUID.randomUUID();
        productId = UUID.randomUUID();
        variantId = UUID.randomUUID();

        checkoutRequest = new CheckoutRequest(
                "Nguyễn Văn A",
                "0901234567",
                "123 Nguyễn Trãi, Quận 1, TP.HCM",
                "Giao hàng trong giờ hành chính",
                "VNPAY",
                List.of(variantId)
        );
    }

    @Nested
    @DisplayName("Checkout thành công")
    class CheckoutSuccessTests {

        @Test
        @DisplayName("Checkout thành công với một sản phẩm")
        void checkout_WithOneCartItem_ShouldCreateOrderSuccessfully() {
            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            2,
                            "https://example.com/glasses.jpg"
                    )
            );

            ProductResponse product = createProduct(
                    productId,
                    new BigDecimal("1000000"),
                    List.of(
                            createVariant(
                                    variantId,
                                    new BigDecimal("200000")
                            )
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(orderRepository.save(any(Order.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            CheckoutResponse response =
                    orderService.checkout(userId, checkoutRequest);

            assertNotNull(response);
            assertNotNull(response.orderCode());
            assertTrue(response.orderCode().startsWith("ORD-"));

            assertEquals(
                    new BigDecimal("2400000"),
                    response.totalAmount()
            );

            assertEquals(OrderStatus.PENDING, response.orderStatus());
            assertNull(response.paymentId());

            assertEquals(
                    PaymentStatus.UNPAID,
                    response.paymentStatus()
            );

            assertNull(response.paymentUrl());

            verify(cartService).getCartEntity(userId);
            verify(productClient).getProductById(productId);

            ArgumentCaptor<Order> orderCaptor =
                    ArgumentCaptor.forClass(Order.class);

            verify(orderRepository, times(1))
                    .save(orderCaptor.capture());

            Order savedOrder = orderCaptor.getValue();

            verify(orderSagaEventPublisher).publishStockReserveRequested(
                    savedOrder.getId(),
                    savedOrder.getItems()
            );
        }

        @Test
        @DisplayName("Checkout tính giá bằng basePrice cộng extraPrice")
        void checkout_ShouldCalculateUnitPriceFromBasePriceAndExtraPrice() {
            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            3,
                            "image-url"
                    )
            );

            ProductResponse product = createProduct(
                    productId,
                    new BigDecimal("500000"),
                    List.of(
                            createVariant(
                                    variantId,
                                    new BigDecimal("50000")
                            )
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(orderRepository.save(any(Order.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            CheckoutResponse response =
                    orderService.checkout(userId, checkoutRequest);

            assertEquals(
                    new BigDecimal("1650000"),
                    response.totalAmount()
            );

            ArgumentCaptor<Order> orderCaptor =
                    ArgumentCaptor.forClass(Order.class);

            verify(orderRepository, times(1))
                    .save(orderCaptor.capture());

            Order savedOrder = orderCaptor.getValue();

            assertEquals(
                    new BigDecimal("1650000"),
                    savedOrder.getTotalAmount()
            );

            assertEquals(1, savedOrder.getItems().size());

            assertEquals(
                    new BigDecimal("550000"),
                    savedOrder.getItems().get(0).getUnitPrice()
            );

            assertEquals(
                    new BigDecimal("1650000"),
                    savedOrder.getItems().get(0).getSubtotal()
            );
        }

        @Test
        @DisplayName("Checkout sử dụng basePrice khi extraPrice bằng null")
        void checkout_WhenExtraPriceIsNull_ShouldUseBasePriceOnly() {
            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            2,
                            "image-url"
                    )
            );

            ProductResponse product = createProduct(
                    productId,
                    new BigDecimal("750000"),
                    List.of(
                            createVariant(variantId, null)
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(orderRepository.save(any(Order.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            CheckoutResponse response =
                    orderService.checkout(userId, checkoutRequest);

            assertEquals(
                    new BigDecimal("1500000"),
                    response.totalAmount()
            );

            ArgumentCaptor<Order> orderCaptor =
                    ArgumentCaptor.forClass(Order.class);

            verify(orderRepository, times(1))
                    .save(orderCaptor.capture());

            Order createdOrder = orderCaptor.getValue();

            assertEquals(
                    new BigDecimal("750000"),
                    createdOrder.getItems().get(0).getUnitPrice()
            );
        }

        @Test
        @DisplayName("Checkout thành công với nhiều sản phẩm")
        void checkout_WithMultipleItems_ShouldCalculateTotalAmount() {
            UUID secondProductId = UUID.randomUUID();
            UUID secondVariantId = UUID.randomUUID();

            CartItem firstItem = createCartItem(
                    productId,
                    variantId,
                    2,
                    "first-image"
            );

            CartItem secondItem = createCartItem(
                    secondProductId,
                    secondVariantId,
                    1,
                    "second-image"
            );

            Cart cart = createCart(firstItem, secondItem);

            ProductResponse firstProduct = createProduct(
                    productId,
                    new BigDecimal("500000"),
                    List.of(
                            createVariant(
                                    variantId,
                                    new BigDecimal("100000")
                            )
                    )
            );

            ProductResponse secondProduct = createProduct(
                    secondProductId,
                    new BigDecimal("1000000"),
                    List.of(
                            createVariant(
                                    secondVariantId,
                                    new BigDecimal("250000")
                            )
                    )
            );

            BigDecimal expectedTotal =
                    new BigDecimal("2450000");

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(firstProduct);

            when(productClient.getProductById(secondProductId))
                    .thenReturn(secondProduct);

            when(orderRepository.save(any(Order.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            CheckoutRequest multiItemRequest = new CheckoutRequest(
                    checkoutRequest.receiverName(),
                    checkoutRequest.receiverPhone(),
                    checkoutRequest.shippingAddress(),
                    checkoutRequest.note(),
                    checkoutRequest.paymentMethod(),
                    List.of(variantId, secondVariantId)
            );

            CheckoutResponse response =
                    orderService.checkout(userId, multiItemRequest);

            assertEquals(
                    expectedTotal,
                    response.totalAmount()
            );

            ArgumentCaptor<Order> orderCaptor =
                    ArgumentCaptor.forClass(Order.class);

            verify(orderRepository, times(1))
                    .save(orderCaptor.capture());

            Order createdOrder = orderCaptor.getValue();

            assertEquals(2, createdOrder.getItems().size());

            assertEquals(
                    expectedTotal,
                    createdOrder.getTotalAmount()
            );

            verify(productClient)
                    .getProductById(productId);

            verify(productClient)
                    .getProductById(secondProductId);
        }

        @Test
        @DisplayName("Checkout phải tạo thông tin đơn hàng đúng với request")
        void checkout_ShouldMapRequestInformationToOrder() {
            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            1,
                            "product-image"
                    )
            );

            ProductResponse product = createProduct(
                    productId,
                    new BigDecimal("100000"),
                    List.of(
                            createVariant(
                                    variantId,
                                    BigDecimal.ZERO
                            )
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(orderRepository.save(any(Order.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            orderService.checkout(userId, checkoutRequest);

            ArgumentCaptor<Order> orderCaptor =
                    ArgumentCaptor.forClass(Order.class);

            verify(orderRepository, times(1))
                    .save(orderCaptor.capture());

            Order createdOrder = orderCaptor.getValue();

            assertEquals(userId, createdOrder.getUserId());

            assertEquals(
                    checkoutRequest.receiverName(),
                    createdOrder.getReceiverName()
            );

            assertEquals(
                    checkoutRequest.receiverPhone(),
                    createdOrder.getReceiverPhone()
            );

            assertEquals(
                    checkoutRequest.shippingAddress(),
                    createdOrder.getShippingAddress()
            );

            assertEquals(
                    checkoutRequest.note(),
                    createdOrder.getNote()
            );

            assertEquals(
                    checkoutRequest.paymentMethod(),
                    createdOrder.getPaymentMethod()
            );

            assertEquals(
                    OrderStatus.PENDING,
                    createdOrder.getStatus()
            );

            assertEquals(
                    PaymentStatus.UNPAID,
                    createdOrder.getPaymentStatus()
            );

            assertNotNull(createdOrder.getOrderCode());
            assertTrue(createdOrder.getOrderCode().startsWith("ORD-"));
        }

        @Test
        @DisplayName("Checkout phải tạo lịch sử trạng thái PENDING")
        void checkout_ShouldCreatePendingStatusHistory() {
            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            1,
                            "image-url"
                    )
            );

            ProductResponse product = createProduct(
                    productId,
                    new BigDecimal("100000"),
                    List.of(
                            createVariant(
                                    variantId,
                                    BigDecimal.ZERO
                            )
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(orderRepository.save(any(Order.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            orderService.checkout(userId, checkoutRequest);

            ArgumentCaptor<Order> orderCaptor =
                    ArgumentCaptor.forClass(Order.class);

            verify(orderRepository, times(1))
                    .save(orderCaptor.capture());

            Order createdOrder = orderCaptor.getValue();

            assertNotNull(createdOrder.getStatusHistories());
            assertEquals(1, createdOrder.getStatusHistories().size());

            assertEquals(
                    OrderStatus.PENDING,
                    createdOrder.getStatusHistories()
                            .get(0)
                            .getStatus()
            );

            assertEquals(
                    userId,
                    createdOrder.getStatusHistories()
                            .get(0)
                            .getChangedBy()
            );

            assertEquals(
                    "Đơn hàng được tạo",
                    createdOrder.getStatusHistories()
                            .get(0)
                            .getNote()
            );

            assertNotNull(
                    createdOrder.getStatusHistories()
                            .get(0)
                            .getChangedAt()
            );
        }

        @Test
        @DisplayName("Checkout phải gửi sự kiện giữ hàng với đúng danh sách sản phẩm")
        void checkout_ShouldPublishStockReserveRequestedWithOrderItems() {
            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            3,
                            "image-url"
                    )
            );

            ProductResponse product = createProduct(
                    productId,
                    new BigDecimal("100000"),
                    List.of(
                            createVariant(
                                    variantId,
                                    BigDecimal.ZERO
                            )
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(orderRepository.save(any(Order.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            orderService.checkout(userId, checkoutRequest);

            @SuppressWarnings("unchecked")
            ArgumentCaptor<List<OrderItem>> itemsCaptor =
                    ArgumentCaptor.forClass(List.class);

            verify(orderSagaEventPublisher).publishStockReserveRequested(
                    isNull(),
                    itemsCaptor.capture()
            );

            List<OrderItem> publishedItems = itemsCaptor.getValue();

            assertEquals(1, publishedItems.size());
            assertEquals(variantId, publishedItems.get(0).getVariantId());
            assertEquals(3, publishedItems.get(0).getQuantity());
        }
    }

    @Nested
    @DisplayName("Checkout thất bại")
    class CheckoutFailureTests {

        @Test
        @DisplayName("Ném BadRequestException khi cart bằng null")
        void checkout_WhenCartIsNull_ShouldThrowBadRequestException() {
            when(cartService.getCartEntity(userId))
                    .thenReturn(null);

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> orderService.checkout(
                                    userId,
                                    checkoutRequest
                            )
                    );

            assertEquals(
                    "Giỏ hàng đang trống",
                    exception.getMessage()
            );

            verify(cartService).getCartEntity(userId);

            verifyNoInteractions(
                    productClient,
                    orderSagaEventPublisher,
                    orderRepository
            );

            verify(cartService, never())
                    .clearCart(any(UUID.class));
        }

        @Test
        @DisplayName("Ném BadRequestException khi cart không có sản phẩm")
        void checkout_WhenCartIsEmpty_ShouldThrowBadRequestException() {
            Cart emptyCart = Cart.builder()
                    .userId(userId)
                    .items(new ArrayList<>())
                    .build();

            when(cartService.getCartEntity(userId))
                    .thenReturn(emptyCart);

            BadRequestException exception =
                    assertThrows(
                            BadRequestException.class,
                            () -> orderService.checkout(
                                    userId,
                                    checkoutRequest
                            )
                    );

            assertEquals(
                    "Giỏ hàng đang trống",
                    exception.getMessage()
            );

            verifyNoInteractions(
                    productClient,
                    orderSagaEventPublisher,
                    orderRepository
            );

            verify(cartService, never())
                    .clearCart(any(UUID.class));
        }

        @Test
        @DisplayName("Ném ResourceNotFoundException khi không tìm thấy variant")
        void checkout_WhenVariantDoesNotExist_ShouldThrowResourceNotFoundException() {
            UUID differentVariantId = UUID.randomUUID();

            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            1,
                            "image-url"
                    )
            );

            ProductResponse product = createProduct(
                    productId,
                    new BigDecimal("500000"),
                    List.of(
                            createVariant(
                                    differentVariantId,
                                    BigDecimal.ZERO
                            )
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> orderService.checkout(
                                    userId,
                                    checkoutRequest
                            )
                    );

            assertEquals(
                    "Không tìm thấy biến thể sản phẩm",
                    exception.getMessage()
            );

            verify(orderRepository, never())
                    .save(any(Order.class));

            verifyNoInteractions(orderSagaEventPublisher);

            verify(cartService, never())
                    .clearCart(any(UUID.class));
        }

        @Test
        @DisplayName("Không xóa giỏ hàng khi ProductClient phát sinh lỗi")
        void checkout_WhenProductClientThrowsException_ShouldNotClearCart() {
            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            1,
                            "image-url"
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenThrow(
                            new ResourceNotFoundException(
                                    "Không tìm thấy sản phẩm"
                            )
                    );

            ResourceNotFoundException exception =
                    assertThrows(
                            ResourceNotFoundException.class,
                            () -> orderService.checkout(
                                    userId,
                                    checkoutRequest
                            )
                    );

            assertEquals(
                    "Không tìm thấy sản phẩm",
                    exception.getMessage()
            );

            verify(orderRepository, never())
                    .save(any(Order.class));

            verifyNoInteractions(orderSagaEventPublisher);

            verify(cartService, never())
                    .clearCart(any(UUID.class));
        }

        @Test
        @DisplayName("Ném ngoại lệ khi gửi sự kiện giữ hàng thất bại")
        void checkout_WhenStockReserveRequestPublishFails_ShouldPropagateException() {
            Cart cart = createCart(
                    createCartItem(
                            productId,
                            variantId,
                            1,
                            "image-url"
                    )
            );

            ProductResponse product = createProduct(
                    productId,
                    new BigDecimal("500000"),
                    List.of(
                            createVariant(
                                    variantId,
                                    BigDecimal.ZERO
                            )
                    )
            );

            when(cartService.getCartEntity(userId))
                    .thenReturn(cart);

            when(productClient.getProductById(productId))
                    .thenReturn(product);

            when(orderRepository.save(any(Order.class)))
                    .thenAnswer(invocation -> invocation.getArgument(0));

            doThrow(
                    new ExternalServiceException(
                            "Không thể gửi yêu cầu giữ hàng"
                    )
            ).when(orderSagaEventPublisher)
                    .publishStockReserveRequested(any(), anyList());

            ExternalServiceException exception =
                    assertThrows(
                            ExternalServiceException.class,
                            () -> orderService.checkout(
                                    userId,
                                    checkoutRequest
                            )
                    );

            assertEquals(
                    "Không thể gửi yêu cầu giữ hàng",
                    exception.getMessage()
            );

            verify(orderRepository, times(1))
                    .save(any(Order.class));

            verify(cartService, never())
                    .clearCart(any(UUID.class));
        }
    }

    private Cart createCart(CartItem... items) {
        return Cart.builder()
                .userId(userId)
                .items(new ArrayList<>(List.of(items)))
                .build();
    }

    private CartItem createCartItem(
            UUID itemProductId,
            UUID itemVariantId,
            int quantity,
            String imageUrl
    ) {
        return CartItem.builder()
                .productId(itemProductId)
                .variantId(itemVariantId)
                .productName("Kính mắt thời trang")
                .skuVariant("GLASSES-BLACK-M")
                .color("Black")
                .size("M")
                .productImageUrl(imageUrl)
                .basePrice(new BigDecimal("1000000"))
                .extraPrice(new BigDecimal("200000"))
                .unitPrice(new BigDecimal("1200000"))
                .quantity(quantity)
                .build();
    }

    private ProductVariantResponse createVariant(
            UUID id,
            BigDecimal extraPrice
    ) {
        return new ProductVariantResponse(
                id,
                "Black",
                "M",
                extraPrice,
                "GLASSES-BLACK-M",
                100
        );
    }

    private ProductResponse createProduct(
            UUID id,
            BigDecimal basePrice,
            List<ProductVariantResponse> variants
    ) {
        return new ProductResponse(
                id,
                "GLASSES-001",
                "Kính mắt thời trang",
                "kinh-mat-thoi-trang",
                "Mô tả sản phẩm",
                "Phù hợp với khuôn mặt trái xoan",
                "ROUND",
                "UNISEX",
                "ACETATE",
                basePrice,
                null,
                null,
                null,
                variants,
                List.of(),
                List.of("OVAL"),
                null,
                null
        );
    }
}
