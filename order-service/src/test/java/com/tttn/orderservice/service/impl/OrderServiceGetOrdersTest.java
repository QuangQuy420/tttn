package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.response.OrderSummaryResponse;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.mapper.OrderMapper;
import com.tttn.orderservice.messaging.OrderSagaEventPublisher;
import com.tttn.orderservice.repository.OrderRepository;
import com.tttn.orderservice.service.CartService;
import com.tttn.orderservice.service.OrderSagaLogService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.data.domain.Sort;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderServiceImpl - getOrders")
class OrderServiceGetOrdersTest {

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
    }

    @Test
    @DisplayName("Lấy tất cả đơn hàng khi status bằng null")
    void getOrders_WhenStatusIsNull_ShouldReturnAllOrders() {
        Order firstOrder = createOrder(
                "ORD-001",
                OrderStatus.PENDING,
                new BigDecimal("1000000")
        );

        Order secondOrder = createOrder(
                "ORD-002",
                OrderStatus.DELIVERED,
                new BigDecimal("2000000")
        );

        OrderSummaryResponse firstSummary =
                createSummaryResponse(
                        firstOrder,
                        OrderStatus.PENDING,
                        new BigDecimal("1000000")
                );

        OrderSummaryResponse secondSummary =
                createSummaryResponse(
                        secondOrder,
                        OrderStatus.DELIVERED,
                        new BigDecimal("2000000")
                );

        PageRequest pageable = PageRequest.of(
                0,
                10,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        PageImpl<Order> orderPage = new PageImpl<>(
                List.of(firstOrder, secondOrder),
                pageable,
                2
        );

        when(orderRepository.findAllByUserId(
                eq(userId),
                any(Pageable.class)
        )).thenReturn(orderPage);

        when(orderMapper.toSummaryResponse(firstOrder))
                .thenReturn(firstSummary);

        when(orderMapper.toSummaryResponse(secondOrder))
                .thenReturn(secondSummary);

        Page<OrderSummaryResponse> response =
                orderService.getOrders(
                        userId,
                        null,
                        1,
                        10
                );

        assertNotNull(response);
        assertEquals(2, response.getContent().size());
        assertEquals(0, response.getNumber());
        assertEquals(10, response.getSize());
        assertEquals(2, response.getTotalElements());
        assertEquals(1, response.getTotalPages());
        assertTrue(response.isFirst());
        assertTrue(response.isLast());

        assertEquals(
                "ORD-001",
                response.getContent().get(0).orderCode()
        );

        assertEquals(
                "ORD-002",
                response.getContent().get(1).orderCode()
        );

        verify(orderRepository).findAllByUserId(
                eq(userId),
                any(Pageable.class)
        );

        verify(orderRepository, never())
                .findAllByUserIdAndStatus(
                        any(UUID.class),
                        any(OrderStatus.class),
                        any(Pageable.class)
                );

        verify(orderMapper).toSummaryResponse(firstOrder);
        verify(orderMapper).toSummaryResponse(secondOrder);
    }

    @Test
    @DisplayName("Lọc đơn hàng theo trạng thái")
    void getOrders_WhenStatusProvided_ShouldFilterByStatus() {
        Order order = createOrder(
                "ORD-CONFIRMED",
                OrderStatus.CONFIRMED,
                new BigDecimal("1500000")
        );

        OrderSummaryResponse summary =
                createSummaryResponse(
                        order,
                        OrderStatus.CONFIRMED,
                        new BigDecimal("1500000")
                );

        PageRequest pageable = PageRequest.of(
                1,
                5,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        PageImpl<Order> orderPage = new PageImpl<>(
                List.of(order),
                pageable,
                6
        );

        when(orderRepository.findAllByUserIdAndStatus(
                eq(userId),
                eq(OrderStatus.CONFIRMED),
                any(Pageable.class)
        )).thenReturn(orderPage);

        when(orderMapper.toSummaryResponse(order))
                .thenReturn(summary);

        Page<OrderSummaryResponse> response =
                orderService.getOrders(
                        userId,
                        OrderStatus.CONFIRMED,
                        2,
                        5
                );

        assertNotNull(response);
        assertEquals(1, response.getContent().size());
        assertEquals(1, response.getNumber());
        assertEquals(5, response.getSize());
        assertEquals(6, response.getTotalElements());
        assertEquals(2, response.getTotalPages());
        assertFalse(response.isFirst());
        assertTrue(response.isLast());

        assertEquals(
                OrderStatus.CONFIRMED,
                response.getContent().get(0).status()
        );

        verify(orderRepository)
                .findAllByUserIdAndStatus(
                        eq(userId),
                        eq(OrderStatus.CONFIRMED),
                        any(Pageable.class)
                );

        verify(orderRepository, never())
                .findAllByUserId(
                        any(UUID.class),
                        any(Pageable.class)
                );
    }

    @Test
    @DisplayName("Tạo Pageable (page từ 1 → index từ 0) với sắp xếp createdAt giảm dần")
    void getOrders_ShouldCreateCorrectPageable() {
        PageImpl<Order> emptyPage = new PageImpl<>(
                List.of(),
                PageRequest.of(
                        2,
                        20,
                        Sort.by(
                                Sort.Direction.DESC,
                                "createdAt"
                        )
                ),
                0
        );

        when(orderRepository.findAllByUserId(
                eq(userId),
                any(Pageable.class)
        )).thenReturn(emptyPage);

        orderService.getOrders(
                userId,
                null,
                3,
                20
        );

        ArgumentCaptor<Pageable> pageableCaptor =
                ArgumentCaptor.forClass(Pageable.class);

        verify(orderRepository).findAllByUserId(
                eq(userId),
                pageableCaptor.capture()
        );

        Pageable capturedPageable =
                pageableCaptor.getValue();

        assertEquals(2, capturedPageable.getPageNumber());
        assertEquals(20, capturedPageable.getPageSize());

        Sort.Order createdAtSort =
                capturedPageable.getSort()
                        .getOrderFor("createdAt");

        assertNotNull(createdAtSort);
        assertEquals(
                Sort.Direction.DESC,
                createdAtSort.getDirection()
        );
    }

    @Test
    @DisplayName("Trả về trang rỗng khi người dùng chưa có đơn hàng")
    void getOrders_WhenNoOrders_ShouldReturnEmptyPage() {
        PageRequest pageable = PageRequest.of(
                0,
                10,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        PageImpl<Order> emptyPage = new PageImpl<>(
                List.of(),
                pageable,
                0
        );

        when(orderRepository.findAllByUserId(
                eq(userId),
                any(Pageable.class)
        )).thenReturn(emptyPage);

        Page<OrderSummaryResponse> response =
                orderService.getOrders(
                        userId,
                        null,
                        1,
                        10
                );

        assertNotNull(response);
        assertNotNull(response.getContent());
        assertTrue(response.getContent().isEmpty());
        assertEquals(0, response.getTotalElements());
        assertEquals(0, response.getTotalPages());
        assertTrue(response.isFirst());
        assertTrue(response.isLast());

        verifyNoInteractions(orderMapper);
    }

    @Test
    @DisplayName("Ném BadRequestException khi page nhỏ hơn 1")
    void getOrders_WhenPageIsLessThanOne_ShouldThrowBadRequestException() {
        BadRequestException exception =
                assertThrows(
                        BadRequestException.class,
                        () -> orderService.getOrders(
                                userId,
                                null,
                                0,
                                10
                        )
                );

        assertEquals(
                "Trang phải lớn hơn hoặc bằng 1",
                exception.getMessage()
        );

        assertEquals("VALIDATION_FAILED", exception.getCode());

        verifyNoInteractions(
                orderRepository,
                orderMapper
        );
    }

    @Test
    @DisplayName("Ném BadRequestException khi limit bằng 0")
    void getOrders_WhenSizeIsZero_ShouldThrowBadRequestException() {
        BadRequestException exception =
                assertThrows(
                        BadRequestException.class,
                        () -> orderService.getOrders(
                                userId,
                                null,
                                1,
                                0
                        )
                );

        assertEquals(
                "Số lượng mỗi trang phải từ 1 đến 100",
                exception.getMessage()
        );

        verifyNoInteractions(
                orderRepository,
                orderMapper
        );
    }

    @Test
    @DisplayName("Ném BadRequestException khi limit lớn hơn 100")
    void getOrders_WhenSizeGreaterThan100_ShouldThrowBadRequestException() {
        BadRequestException exception =
                assertThrows(
                        BadRequestException.class,
                        () -> orderService.getOrders(
                                userId,
                                null,
                                1,
                                101
                        )
                );

        assertEquals(
                "Số lượng mỗi trang phải từ 1 đến 100",
                exception.getMessage()
        );

        verifyNoInteractions(
                orderRepository,
                orderMapper
        );
    }

    @Test
    @DisplayName("Chấp nhận limit nhỏ nhất là 1")
    void getOrders_WhenSizeIsOne_ShouldWork() {
        PageRequest pageable = PageRequest.of(
                0,
                1,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        PageImpl<Order> emptyPage = new PageImpl<>(
                List.of(),
                pageable,
                0
        );

        when(orderRepository.findAllByUserId(
                eq(userId),
                any(Pageable.class)
        )).thenReturn(emptyPage);

        Page<OrderSummaryResponse> response =
                orderService.getOrders(
                        userId,
                        null,
                        1,
                        1
                );

        assertNotNull(response);
        assertEquals(1, response.getSize());
    }

    @Test
    @DisplayName("Chấp nhận limit lớn nhất là 100")
    void getOrders_WhenSizeIsOneHundred_ShouldWork() {
        PageRequest pageable = PageRequest.of(
                0,
                100,
                Sort.by(Sort.Direction.DESC, "createdAt")
        );

        PageImpl<Order> emptyPage = new PageImpl<>(
                List.of(),
                pageable,
                0
        );

        when(orderRepository.findAllByUserId(
                eq(userId),
                any(Pageable.class)
        )).thenReturn(emptyPage);

        Page<OrderSummaryResponse> response =
                orderService.getOrders(
                        userId,
                        null,
                        1,
                        100
                );

        assertNotNull(response);
        assertEquals(100, response.getSize());
    }

    private Order createOrder(
            String orderCode,
            OrderStatus status,
            BigDecimal totalAmount
    ) {
        return Order.builder()
                .id(UUID.randomUUID())
                .orderCode(orderCode)
                .userId(userId)
                .receiverName("Nguyễn Văn A")
                .receiverPhone("0901234567")
                .shippingAddress("TP.HCM")
                .paymentMethod("VNPAY")
                .paymentStatus(PaymentStatus.UNPAID)
                .status(status)
                .totalAmount(totalAmount)
                .build();
    }

    private OrderSummaryResponse createSummaryResponse(
            Order order,
            OrderStatus status,
            BigDecimal totalAmount
    ) {
        return new OrderSummaryResponse(
                order.getId(),
                order.getOrderCode(),
                totalAmount,
                status,
                order.getPaymentMethod(),
                order.getPaymentStatus(),
                order.getReceiverName(),
                order.getReceiverPhone(),
                LocalDateTime.now()
        );
    }
}