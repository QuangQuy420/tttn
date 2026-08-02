package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.request.CancelOrderRequest;
import com.tttn.orderservice.dto.response.OrderResponse;
import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.entity.OrderStatusHistory;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.exception.BadRequestException;
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
import org.mockito.ArgumentCaptor;
import org.mockito.InOrder;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderServiceImpl - cancelOrder")
class OrderServiceCancelOrderTest {

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

    @Mock
    private CancelOrderRequest cancelOrderRequest;

    private OrderServiceImpl orderService;

    private UUID userId;
    private UUID orderId;

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
    }

    @Test
    @DisplayName("Hủy thành công đơn hàng đang ở trạng thái PENDING")
    void cancelOrder_WhenStatusIsPending_ShouldCancelSuccessfully() {
        Order order = createOrder(OrderStatus.PENDING);
        OrderResponse expectedResponse = mock(OrderResponse.class);

        when(cancelOrderRequest.reason())
                .thenReturn("Tôi không còn nhu cầu mua");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(any(Order.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        when(orderMapper.toResponse(any(Order.class)))
                .thenReturn(expectedResponse);

        OrderResponse actualResponse = orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        assertNotNull(actualResponse);
        assertSame(expectedResponse, actualResponse);
        assertEquals(OrderStatus.CANCELLED, order.getStatus());

        verify(orderRepository)
                .findByIdAndUserId(orderId, userId);

        verify(orderRepository).save(order);
        verify(orderMapper).toResponse(order);
    }

    @Test
    @DisplayName("Hủy thành công đơn hàng đang ở trạng thái CONFIRMED")
    void cancelOrder_WhenStatusIsConfirmed_ShouldCancelSuccessfully() {
        Order order = createOrder(OrderStatus.CONFIRMED);
        OrderResponse expectedResponse = mock(OrderResponse.class);

        when(cancelOrderRequest.reason())
                .thenReturn("Muốn thay đổi sản phẩm");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(expectedResponse);

        OrderResponse result = orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        assertSame(expectedResponse, result);
        assertEquals(OrderStatus.CANCELLED, order.getStatus());

        verify(orderRepository).save(order);
        verify(orderMapper).toResponse(order);
    }

    @Test
    @DisplayName("Tạo lịch sử trạng thái CANCELLED đúng thông tin")
    void cancelOrder_ShouldCreateCancelledStatusHistory() {
        Order order = createOrder(OrderStatus.PENDING);
        String cancellationReason = "Đặt nhầm địa chỉ giao hàng";

        when(cancelOrderRequest.reason())
                .thenReturn(cancellationReason);

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        assertNotNull(order.getStatusHistories());
        assertEquals(1, order.getStatusHistories().size());

        OrderStatusHistory history =
                order.getStatusHistories().get(0);

        assertEquals(
                OrderStatus.CANCELLED,
                history.getStatus()
        );

        assertEquals(userId, history.getChangedBy());
        assertEquals(cancellationReason, history.getNote());
    }

    @Test
    @DisplayName("Lưu đơn hàng sau khi đổi trạng thái thành CANCELLED")
    void cancelOrder_ShouldSaveCancelledOrder() {
        Order order = createOrder(OrderStatus.PENDING);

        when(cancelOrderRequest.reason())
                .thenReturn("Không muốn mua nữa");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(any(Order.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        when(orderMapper.toResponse(any(Order.class)))
                .thenReturn(mock(OrderResponse.class));

        orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        ArgumentCaptor<Order> orderCaptor =
                ArgumentCaptor.forClass(Order.class);

        verify(orderRepository).save(orderCaptor.capture());

        Order savedOrder = orderCaptor.getValue();

        assertSame(order, savedOrder);
        assertEquals(
                OrderStatus.CANCELLED,
                savedOrder.getStatus()
        );

        assertEquals(
                1,
                savedOrder.getStatusHistories().size()
        );
    }

    @Test
    @DisplayName("Mapper nhận đúng entity được repository save trả về")
    void cancelOrder_ShouldMapSavedOrder() {
        Order foundOrder = createOrder(OrderStatus.PENDING);

        Order savedOrder = createOrder(OrderStatus.CANCELLED);
        savedOrder.setId(orderId);

        OrderResponse expectedResponse = mock(OrderResponse.class);

        when(cancelOrderRequest.reason())
                .thenReturn("Hủy đơn");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(foundOrder));

        when(orderRepository.save(foundOrder))
                .thenReturn(savedOrder);

        when(orderMapper.toResponse(savedOrder))
                .thenReturn(expectedResponse);

        OrderResponse result = orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        assertSame(expectedResponse, result);

        verify(orderMapper).toResponse(same(savedOrder));
        verify(orderMapper, never()).toResponse(same(foundOrder));
    }

    @Test
    @DisplayName("Thực hiện tìm đơn, lưu đơn rồi mới mapping")
    void cancelOrder_ShouldExecuteOperationsInCorrectOrder() {
        Order order = createOrder(OrderStatus.PENDING);
        OrderResponse response = mock(OrderResponse.class);

        when(cancelOrderRequest.reason())
                .thenReturn("Hủy đơn");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(response);

        orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        InOrder inOrder = inOrder(
                orderRepository,
                orderMapper
        );

        inOrder.verify(orderRepository)
                .findByIdAndUserId(orderId, userId);

        inOrder.verify(orderRepository).save(order);
        inOrder.verify(orderMapper).toResponse(order);
    }

    @Test
    @DisplayName("Ném ResourceNotFoundException khi không tìm thấy đơn hàng")
    void cancelOrder_WhenOrderDoesNotExist_ShouldThrowResourceNotFoundException() {
        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.empty());

        ResourceNotFoundException exception = assertThrows(
                ResourceNotFoundException.class,
                () -> orderService.cancelOrder(
                        userId,
                        orderId,
                        cancelOrderRequest
                )
        );

        assertEquals(
                "Không tìm thấy đơn hàng",
                exception.getMessage()
        );

        verify(orderRepository)
                .findByIdAndUserId(orderId, userId);

        verify(orderRepository, never())
                .save(any(Order.class));

        verifyNoInteractions(orderMapper);
        verifyNoInteractions(cancelOrderRequest);
    }

    @Test
    @DisplayName("Không cho phép hủy đơn ở trạng thái PROCESSING")
    void cancelOrder_WhenStatusIsProcessing_ShouldThrowBadRequestException() {
        assertCannotCancelStatus(OrderStatus.PROCESSING);
    }

    @Test
    @DisplayName("Không cho phép hủy đơn ở trạng thái SHIPPING")
    void cancelOrder_WhenStatusIsShipping_ShouldThrowBadRequestException() {
        assertCannotCancelStatus(OrderStatus.SHIPPING);
    }

    @Test
    @DisplayName("Không cho phép hủy đơn ở trạng thái DELIVERED")
    void cancelOrder_WhenStatusIsDelivered_ShouldThrowBadRequestException() {
        assertCannotCancelStatus(OrderStatus.DELIVERED);
    }

    @Test
    @DisplayName("Không cho phép hủy đơn ở trạng thái COMPLETED")
    void cancelOrder_WhenStatusIsCompleted_ShouldThrowBadRequestException() {
        assertCannotCancelStatus(OrderStatus.COMPLETED);
    }

    @Test
    @DisplayName("Không cho phép hủy lại đơn đã CANCELLED")
    void cancelOrder_WhenStatusIsCancelled_ShouldThrowBadRequestException() {
        assertCannotCancelStatus(OrderStatus.CANCELLED);
    }

    @Test
    @DisplayName("Không thay đổi đơn hàng khi trạng thái không được phép hủy")
    void cancelOrder_WhenStatusIsInvalid_ShouldNotModifyOrder() {
        Order order = createOrder(OrderStatus.SHIPPING);

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        assertThrows(
                BadRequestException.class,
                () -> orderService.cancelOrder(
                        userId,
                        orderId,
                        cancelOrderRequest
                )
        );

        assertEquals(OrderStatus.SHIPPING, order.getStatus());

        if (order.getStatusHistories() != null) {
            assertTrue(order.getStatusHistories().isEmpty());
        }

        verify(orderRepository, never())
                .save(any(Order.class));

        verifyNoInteractions(orderMapper);
        verifyNoInteractions(cancelOrderRequest);
    }

    @Test
    @DisplayName("Chỉ truy vấn đơn hàng thuộc đúng người dùng")
    void cancelOrder_ShouldFindOrderByOrderIdAndUserId() {
        Order order = createOrder(OrderStatus.PENDING);

        when(cancelOrderRequest.reason())
                .thenReturn("Hủy");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        verify(orderRepository)
                .findByIdAndUserId(orderId, userId);

        verify(orderRepository, never())
                .findById(any(UUID.class));
    }

    @Test
    @DisplayName("Không sử dụng CartService hoặc ProductClient")
    void cancelOrder_ShouldNotUseUnrelatedDependencies() {
        Order order = createOrder(OrderStatus.PENDING);

        when(cancelOrderRequest.reason())
                .thenReturn("Hủy");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        verifyNoInteractions(
                cartService,
                productClient
        );
    }

    @Test
    @DisplayName("Hủy đơn PENDING vẫn thử gửi nhả hàng, đề phòng hàng đã được giữ thật trước khi "
            + "order-service kịp xử lý phản hồi 'stock.reserved'")
    void cancelOrder_WhenStatusIsPending_ShouldStillAttemptStockRelease() {
        Order order = createOrder(OrderStatus.PENDING);

        when(cancelOrderRequest.reason())
                .thenReturn("Hủy");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        verify(orderSagaEventPublisher)
                .publishStockReleaseRequested(orderId, order.getItems());
    }

    @Test
    @DisplayName("Hủy đơn AWAITING_PAYMENT vẫn thử gửi nhả hàng như trước")
    void cancelOrder_WhenStatusIsAwaitingPayment_ShouldAttemptStockRelease() {
        Order order = createOrder(OrderStatus.AWAITING_PAYMENT);

        when(cancelOrderRequest.reason())
                .thenReturn("Hủy");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        verify(orderSagaEventPublisher)
                .publishStockReleaseRequested(orderId, order.getItems());
    }

    @Test
    @DisplayName("Hủy đơn CONFIRMED không gửi nhả hàng (không có logic hoàn tiền/nhả hàng cho đơn đã thanh toán)")
    void cancelOrder_WhenStatusIsConfirmed_ShouldNotAttemptStockRelease() {
        Order order = createOrder(OrderStatus.CONFIRMED);

        when(cancelOrderRequest.reason())
                .thenReturn("Hủy");

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.cancelOrder(
                userId,
                orderId,
                cancelOrderRequest
        );

        verifyNoInteractions(orderSagaEventPublisher);
    }

    private void assertCannotCancelStatus(OrderStatus status) {
        Order order = createOrder(status);

        when(orderRepository.findByIdAndUserId(orderId, userId))
                .thenReturn(Optional.of(order));

        BadRequestException exception = assertThrows(
                BadRequestException.class,
                () -> orderService.cancelOrder(
                        userId,
                        orderId,
                        cancelOrderRequest
                )
        );

        assertEquals(
                "Không thể hủy đơn ở trạng thái " + status,
                exception.getMessage()
        );

        assertEquals(status, order.getStatus());

        verify(orderRepository, never())
                .save(any(Order.class));

        verifyNoInteractions(orderMapper);
        verifyNoInteractions(cancelOrderRequest);
    }

    private Order createOrder(OrderStatus status) {
        return Order.builder()
                .id(orderId)
                .orderCode("ORD-CANCEL-001")
                .userId(userId)
                .receiverName("Nguyễn Văn A")
                .receiverPhone("0901234567")
                .shippingAddress("TP.HCM")
                .note("Giao giờ hành chính")
                .paymentMethod("VNPAY")
                .paymentStatus(PaymentStatus.UNPAID)
                .status(status)
                .totalAmount(new BigDecimal("1500000"))
                .build();
    }
}