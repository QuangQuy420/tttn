package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.response.OrderResponse;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.mapper.OrderMapper;
import com.tttn.orderservice.messaging.OrderSagaEventPublisher;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.CartService;
import com.tttn.orderservice.service.OrderSagaLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderServiceImpl - getOrderDetail")
class OrderServiceGetOrderDetailTest {

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

    @Mock
    private OrderSagaLogService orderSagaLogService;

    private OrderServiceImpl orderService;

    private UUID userId;
    private UUID orderId;
    private Order order;

    @BeforeEach
    void setUp() {
        orderService = new OrderServiceImpl(
                orderRepository,
                cartService,
                productClient,
                orderSagaEventPublisher,
                orderMapper,
                orderSagaLogService
        );

        userId = UUID.randomUUID();
        orderId = UUID.randomUUID();

        order = Order.builder()
                .id(orderId)
                .orderCode("ORD-DETAIL-001")
                .userId(userId)
                .receiverName("Nguyễn Văn A")
                .receiverPhone("0901234567")
                .shippingAddress("123 Nguyễn Trãi, TP.HCM")
                .note("Giao hàng giờ hành chính")
                .paymentMethod("VNPAY")
                .paymentStatus(PaymentStatus.UNPAID)
                .status(OrderStatus.PENDING)
                .totalAmount(new BigDecimal("1500000"))
                .build();
    }

    @Test
    @DisplayName("Trả về chi tiết đơn hàng khi đơn thuộc người dùng")
    void getOrderDetail_WhenOrderExists_ShouldReturnOrderResponse() {
        OrderResponse expectedResponse =
                mock(OrderResponse.class);

        when(orderRepository.findByIdAndUserId(
                orderId,
                userId
        )).thenReturn(Optional.of(order));

        when(orderMapper.toResponse(order))
                .thenReturn(expectedResponse);

        OrderResponse actualResponse =
                orderService.getOrderDetail(
                        userId,
                        orderId
                );

        assertNotNull(actualResponse);
        assertSame(expectedResponse, actualResponse);

        verify(orderRepository)
                .findByIdAndUserId(orderId, userId);

        verify(orderMapper).toResponse(order);

        verifyNoMoreInteractions(
                orderRepository,
                orderMapper
        );

        verifyNoInteractions(
                cartService,
                productClient,
                orderSagaEventPublisher
        );
    }

    @Test
    @DisplayName("Repository phải được gọi trước mapper")
    void getOrderDetail_ShouldFindOrderBeforeMapping() {
        OrderResponse response =
                mock(OrderResponse.class);

        when(orderRepository.findByIdAndUserId(
                orderId,
                userId
        )).thenReturn(Optional.of(order));

        when(orderMapper.toResponse(order))
                .thenReturn(response);

        orderService.getOrderDetail(userId, orderId);

        InOrder inOrder = inOrder(
                orderRepository,
                orderMapper
        );

        inOrder.verify(orderRepository)
                .findByIdAndUserId(orderId, userId);

        inOrder.verify(orderMapper)
                .toResponse(order);
    }

    @Test
    @DisplayName("Truy vấn đồng thời theo orderId và userId")
    void getOrderDetail_ShouldQueryByOrderIdAndUserId() {
        OrderResponse response =
                mock(OrderResponse.class);

        when(orderRepository.findByIdAndUserId(
                orderId,
                userId
        )).thenReturn(Optional.of(order));

        when(orderMapper.toResponse(order))
                .thenReturn(response);

        orderService.getOrderDetail(userId, orderId);

        verify(orderRepository)
                .findByIdAndUserId(orderId, userId);

        verify(orderRepository, never())
                .findById(any(UUID.class));
    }

    @Test
    @DisplayName("Ném ResourceNotFoundException khi không tìm thấy đơn hàng")
    void getOrderDetail_WhenOrderDoesNotExist_ShouldThrowResourceNotFoundException() {
        when(orderRepository.findByIdAndUserId(
                orderId,
                userId
        )).thenReturn(Optional.empty());

        ResourceNotFoundException exception =
                assertThrows(
                        ResourceNotFoundException.class,
                        () -> orderService.getOrderDetail(
                                userId,
                                orderId
                        )
                );

        assertEquals(
                "Không tìm thấy đơn hàng",
                exception.getMessage()
        );

        verify(orderRepository)
                .findByIdAndUserId(orderId, userId);

        verifyNoInteractions(orderMapper);

        verifyNoInteractions(
                cartService,
                productClient,
                orderSagaEventPublisher
        );
    }

    @Test
    @DisplayName("Không trả về đơn hàng của người dùng khác")
    void getOrderDetail_WhenOrderBelongsToAnotherUser_ShouldThrowResourceNotFoundException() {
        UUID anotherUserId = UUID.randomUUID();

        when(orderRepository.findByIdAndUserId(
                orderId,
                anotherUserId
        )).thenReturn(Optional.empty());

        ResourceNotFoundException exception =
                assertThrows(
                        ResourceNotFoundException.class,
                        () -> orderService.getOrderDetail(
                                anotherUserId,
                                orderId
                        )
                );

        assertEquals(
                "Không tìm thấy đơn hàng",
                exception.getMessage()
        );

        verify(orderRepository)
                .findByIdAndUserId(
                        orderId,
                        anotherUserId
                );

        verifyNoInteractions(orderMapper);
    }

    @Test
    @DisplayName("Không gọi mapper khi repository trả về empty")
    void getOrderDetail_WhenRepositoryReturnsEmpty_ShouldNotCallMapper() {
        when(orderRepository.findByIdAndUserId(
                orderId,
                userId
        )).thenReturn(Optional.empty());

        assertThrows(
                ResourceNotFoundException.class,
                () -> orderService.getOrderDetail(
                        userId,
                        orderId
                )
        );

        verify(orderMapper, never())
                .toResponse(any(Order.class));
    }

    @Test
    @DisplayName("Trả nguyên kết quả được tạo bởi OrderMapper")
    void getOrderDetail_ShouldReturnExactlyMapperResult() {
        OrderResponse mapperResult =
                mock(OrderResponse.class);

        when(orderRepository.findByIdAndUserId(
                orderId,
                userId
        )).thenReturn(Optional.of(order));

        when(orderMapper.toResponse(order))
                .thenReturn(mapperResult);

        OrderResponse result =
                orderService.getOrderDetail(
                        userId,
                        orderId
                );

        assertSame(mapperResult, result);
    }

    @Test
    @DisplayName("Truyền đúng entity lấy từ repository vào mapper")
    void getOrderDetail_ShouldPassFoundEntityToMapper() {
        Order repositoryOrder = Order.builder()
                .id(orderId)
                .orderCode("ORD-REPOSITORY")
                .userId(userId)
                .receiverName("Trần Văn B")
                .receiverPhone("0912345678")
                .shippingAddress("Hà Nội")
                .paymentMethod("COD")
                .paymentStatus(PaymentStatus.UNPAID)
                .status(OrderStatus.CONFIRMED)
                .totalAmount(new BigDecimal("2000000"))
                .build();

        OrderResponse response =
                mock(OrderResponse.class);

        when(orderRepository.findByIdAndUserId(
                orderId,
                userId
        )).thenReturn(Optional.of(repositoryOrder));

        when(orderMapper.toResponse(repositoryOrder))
                .thenReturn(response);

        orderService.getOrderDetail(userId, orderId);

        verify(orderMapper)
                .toResponse(same(repositoryOrder));

        verify(orderMapper, never())
                .toResponse(same(order));
    }
}