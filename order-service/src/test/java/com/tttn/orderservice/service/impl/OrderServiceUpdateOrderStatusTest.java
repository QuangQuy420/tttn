package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.dto.request.UpdateOrderStatusRequest;
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
@DisplayName("OrderServiceImpl - updateOrderStatus")
class OrderServiceUpdateOrderStatusTest {

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
    private UpdateOrderStatusRequest request;

    private OrderServiceImpl orderService;

    private UUID orderId;
    private UUID changedBy;

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

        orderId = UUID.randomUUID();
        changedBy = UUID.randomUUID();
    }

    @Test
    @DisplayName("Không cho phép chuyển trực tiếp từ PENDING sang CONFIRMED")
    void updateOrderStatus_FromPendingToConfirmed_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.PENDING,
                OrderStatus.CONFIRMED
        );
    }

    @Test
    @DisplayName("Chuyển trạng thái từ PENDING sang CANCELLED thành công")
    void updateOrderStatus_FromPendingToCancelled_ShouldSucceed() {
        assertValidTransition(
                OrderStatus.PENDING,
                OrderStatus.CANCELLED
        );
    }

    @Test
    @DisplayName("Chuyển trạng thái từ CONFIRMED sang PROCESSING thành công")
    void updateOrderStatus_FromConfirmedToProcessing_ShouldSucceed() {
        assertValidTransition(
                OrderStatus.CONFIRMED,
                OrderStatus.PROCESSING
        );
    }

    @Test
    @DisplayName("Chuyển trạng thái từ CONFIRMED sang CANCELLED thành công")
    void updateOrderStatus_FromConfirmedToCancelled_ShouldSucceed() {
        assertValidTransition(
                OrderStatus.CONFIRMED,
                OrderStatus.CANCELLED
        );
    }

    @Test
    @DisplayName("Chuyển trạng thái từ PROCESSING sang SHIPPING thành công")
    void updateOrderStatus_FromProcessingToShipping_ShouldSucceed() {
        assertValidTransition(
                OrderStatus.PROCESSING,
                OrderStatus.SHIPPING
        );
    }

    @Test
    @DisplayName("Chuyển trạng thái từ SHIPPING sang DELIVERED thành công")
    void updateOrderStatus_FromShippingToDelivered_ShouldSucceed() {
        assertValidTransition(
                OrderStatus.SHIPPING,
                OrderStatus.DELIVERED
        );
    }

    @Test
    @DisplayName("Chuyển trạng thái từ DELIVERED sang COMPLETED thành công")
    void updateOrderStatus_FromDeliveredToCompleted_ShouldSucceed() {
        assertValidTransition(
                OrderStatus.DELIVERED,
                OrderStatus.COMPLETED
        );
    }

    @Test
    @DisplayName("Cập nhật trạng thái và trả đúng kết quả từ mapper")
    void updateOrderStatus_ShouldReturnMapperResult() {
        Order order = createOrder(OrderStatus.AWAITING_PAYMENT);
        OrderResponse expectedResponse = mock(OrderResponse.class);

        when(request.status())
                .thenReturn(OrderStatus.CONFIRMED);

        when(request.note())
                .thenReturn("Quản trị viên xác nhận đơn hàng");

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(expectedResponse);

        OrderResponse result = orderService.updateOrderStatus(
                orderId,
                changedBy,
                request
        );

        assertSame(expectedResponse, result);
        assertEquals(
                OrderStatus.CONFIRMED,
                order.getStatus()
        );

        verify(orderRepository).findById(orderId);
        verify(orderRepository).save(order);
        verify(orderMapper).toResponse(order);
    }

    @Test
    @DisplayName("Tạo lịch sử trạng thái với đầy đủ thông tin")
    void updateOrderStatus_ShouldCreateStatusHistory() {
        Order order = createOrder(OrderStatus.CONFIRMED);
        String note = "Bắt đầu đóng gói sản phẩm";

        when(request.status())
                .thenReturn(OrderStatus.PROCESSING);

        when(request.note())
                .thenReturn(note);

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.updateOrderStatus(
                orderId,
                changedBy,
                request
        );

        assertNotNull(order.getStatusHistories());
        assertEquals(1, order.getStatusHistories().size());

        OrderStatusHistory history =
                order.getStatusHistories().get(0);

        assertEquals(
                OrderStatus.PROCESSING,
                history.getStatus()
        );

        assertEquals(
                changedBy,
                history.getChangedBy()
        );

        assertEquals(note, history.getNote());
    }

    @Test
    @DisplayName("Lưu entity sau khi cập nhật trạng thái")
    void updateOrderStatus_ShouldSaveUpdatedOrder() {
        Order order = createOrder(OrderStatus.PROCESSING);

        when(request.status())
                .thenReturn(OrderStatus.SHIPPING);

        when(request.note())
                .thenReturn("Đã bàn giao cho đơn vị vận chuyển");

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(any(Order.class)))
                .thenAnswer(invocation -> invocation.getArgument(0));

        when(orderMapper.toResponse(any(Order.class)))
                .thenReturn(mock(OrderResponse.class));

        orderService.updateOrderStatus(
                orderId,
                changedBy,
                request
        );

        ArgumentCaptor<Order> captor =
                ArgumentCaptor.forClass(Order.class);

        verify(orderRepository).save(captor.capture());

        Order savedOrder = captor.getValue();

        assertSame(order, savedOrder);

        assertEquals(
                OrderStatus.SHIPPING,
                savedOrder.getStatus()
        );

        assertEquals(
                1,
                savedOrder.getStatusHistories().size()
        );
    }

    @Test
    @DisplayName("Mapper nhận entity do repository save trả về")
    void updateOrderStatus_ShouldMapSavedEntity() {
        Order foundOrder = createOrder(OrderStatus.AWAITING_PAYMENT);
        Order savedOrder = createOrder(OrderStatus.CONFIRMED);
        OrderResponse expectedResponse = mock(OrderResponse.class);

        when(request.status())
                .thenReturn(OrderStatus.CONFIRMED);

        when(request.note())
                .thenReturn("Xác nhận đơn");

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(foundOrder));

        when(orderRepository.save(foundOrder))
                .thenReturn(savedOrder);

        when(orderMapper.toResponse(savedOrder))
                .thenReturn(expectedResponse);

        OrderResponse result = orderService.updateOrderStatus(
                orderId,
                changedBy,
                request
        );

        assertSame(expectedResponse, result);

        verify(orderMapper).toResponse(same(savedOrder));
        verify(orderMapper, never())
                .toResponse(same(foundOrder));
    }

    @Test
    @DisplayName("Thực hiện tìm đơn, lưu đơn rồi mapping theo đúng thứ tự")
    void updateOrderStatus_ShouldExecuteInCorrectOrder() {
        Order order = createOrder(OrderStatus.AWAITING_PAYMENT);

        when(request.status())
                .thenReturn(OrderStatus.CONFIRMED);

        when(request.note())
                .thenReturn("Xác nhận đơn");

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.updateOrderStatus(
                orderId,
                changedBy,
                request
        );

        InOrder inOrder = inOrder(
                orderRepository,
                orderMapper
        );

        inOrder.verify(orderRepository)
                .findById(orderId);

        inOrder.verify(orderRepository)
                .save(order);

        inOrder.verify(orderMapper)
                .toResponse(order);
    }

    @Test
    @DisplayName("Ném ResourceNotFoundException khi không tìm thấy đơn")
    void updateOrderStatus_WhenOrderDoesNotExist_ShouldThrowResourceNotFoundException() {
        when(orderRepository.findById(orderId))
                .thenReturn(Optional.empty());

        ResourceNotFoundException exception =
                assertThrows(
                        ResourceNotFoundException.class,
                        () -> orderService.updateOrderStatus(
                                orderId,
                                changedBy,
                                request
                        )
                );

        assertEquals(
                "Không tìm thấy đơn hàng",
                exception.getMessage()
        );

        verify(orderRepository).findById(orderId);

        verify(orderRepository, never())
                .save(any(Order.class));

        verifyNoInteractions(orderMapper);
        verifyNoInteractions(request);
    }

    @Test
    @DisplayName("Không cho phép chuyển từ PENDING sang PROCESSING")
    void updateOrderStatus_FromPendingToProcessing_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.PENDING,
                OrderStatus.PROCESSING
        );
    }

    @Test
    @DisplayName("Không cho phép chuyển từ PENDING sang SHIPPING")
    void updateOrderStatus_FromPendingToShipping_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.PENDING,
                OrderStatus.SHIPPING
        );
    }

    @Test
    @DisplayName("Không cho phép chuyển từ CONFIRMED sang DELIVERED")
    void updateOrderStatus_FromConfirmedToDelivered_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.CONFIRMED,
                OrderStatus.DELIVERED
        );
    }

    @Test
    @DisplayName("Không cho phép chuyển từ PROCESSING sang CANCELLED")
    void updateOrderStatus_FromProcessingToCancelled_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.PROCESSING,
                OrderStatus.CANCELLED
        );
    }

    @Test
    @DisplayName("Không cho phép chuyển từ SHIPPING sang COMPLETED")
    void updateOrderStatus_FromShippingToCompleted_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.SHIPPING,
                OrderStatus.COMPLETED
        );
    }

    @Test
    @DisplayName("Không cho phép chuyển từ DELIVERED sang SHIPPING")
    void updateOrderStatus_FromDeliveredToShipping_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.DELIVERED,
                OrderStatus.SHIPPING
        );
    }

    @Test
    @DisplayName("Không cho phép thay đổi trạng thái đơn COMPLETED")
    void updateOrderStatus_FromCompleted_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.COMPLETED,
                OrderStatus.DELIVERED
        );
    }

    @Test
    @DisplayName("Không cho phép thay đổi trạng thái đơn CANCELLED")
    void updateOrderStatus_FromCancelled_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.CANCELLED,
                OrderStatus.PENDING
        );
    }

    @Test
    @DisplayName("Không cho phép cập nhật lại cùng một trạng thái")
    void updateOrderStatus_ToSameStatus_ShouldThrowException() {
        assertInvalidTransition(
                OrderStatus.PENDING,
                OrderStatus.PENDING
        );
    }

    @Test
    @DisplayName("Không lưu hoặc mapping khi chuyển trạng thái không hợp lệ")
    void updateOrderStatus_WhenTransitionInvalid_ShouldNotSaveOrMap() {
        Order order = createOrder(OrderStatus.SHIPPING);

        when(request.status())
                .thenReturn(OrderStatus.PROCESSING);

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(order));

        assertThrows(
                BadRequestException.class,
                () -> orderService.updateOrderStatus(
                        orderId,
                        changedBy,
                        request
                )
        );

        assertEquals(
                OrderStatus.SHIPPING,
                order.getStatus()
        );

        if (order.getStatusHistories() != null) {
            assertTrue(
                    order.getStatusHistories().isEmpty()
            );
        }

        verify(orderRepository, never())
                .save(any(Order.class));

        verifyNoInteractions(orderMapper);

        verify(request, never())
                .note();
    }

    @Test
    @DisplayName("Không sử dụng các dependency không liên quan")
    void updateOrderStatus_ShouldNotUseUnrelatedDependencies() {
        Order order = createOrder(OrderStatus.AWAITING_PAYMENT);

        when(request.status())
                .thenReturn(OrderStatus.CONFIRMED);

        when(request.note())
                .thenReturn("Xác nhận đơn");

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(mock(OrderResponse.class));

        orderService.updateOrderStatus(
                orderId,
                changedBy,
                request
        );

        verifyNoInteractions(
                cartService,
                productClient,
                orderSagaEventPublisher
        );
    }

    private void assertValidTransition(
            OrderStatus current,
            OrderStatus target
    ) {
        Order order = createOrder(current);
        OrderResponse expectedResponse = mock(OrderResponse.class);

        when(request.status())
                .thenReturn(target);

        when(request.note())
                .thenReturn("Cập nhật trạng thái đơn hàng");

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(order));

        when(orderRepository.save(order))
                .thenReturn(order);

        when(orderMapper.toResponse(order))
                .thenReturn(expectedResponse);

        OrderResponse result = orderService.updateOrderStatus(
                orderId,
                changedBy,
                request
        );

        assertSame(expectedResponse, result);
        assertEquals(target, order.getStatus());

        assertNotNull(order.getStatusHistories());
        assertEquals(1, order.getStatusHistories().size());

        OrderStatusHistory history =
                order.getStatusHistories().get(0);

        assertEquals(target, history.getStatus());
        assertEquals(changedBy, history.getChangedBy());
        assertEquals(
                "Cập nhật trạng thái đơn hàng",
                history.getNote()
        );

        verify(orderRepository).save(order);
        verify(orderMapper).toResponse(order);
    }

    private void assertInvalidTransition(
            OrderStatus current,
            OrderStatus target
    ) {
        Order order = createOrder(current);

        when(request.status())
                .thenReturn(target);

        when(orderRepository.findById(orderId))
                .thenReturn(Optional.of(order));

        BadRequestException exception =
                assertThrows(
                        BadRequestException.class,
                        () -> orderService.updateOrderStatus(
                                orderId,
                                changedBy,
                                request
                        )
                );

        assertEquals(
                "Không thể chuyển trạng thái từ "
                        + current
                        + " sang "
                        + target,
                exception.getMessage()
        );

        assertEquals(current, order.getStatus());

        if (order.getStatusHistories() != null) {
            assertTrue(
                    order.getStatusHistories().isEmpty()
            );
        }

        verify(orderRepository, never())
                .save(any(Order.class));

        verifyNoInteractions(orderMapper);

        verify(request, never())
                .note();
    }

    private Order createOrder(OrderStatus status) {
        return Order.builder()
                .id(orderId)
                .orderCode("ORD-STATUS-001")
                .userId(UUID.randomUUID())
                .receiverName("Nguyễn Văn A")
                .receiverPhone("0901234567")
                .shippingAddress("TP.HCM")
                .note("Giao trong giờ hành chính")
                .paymentMethod("VNPAY")
                .paymentStatus(PaymentStatus.UNPAID)
                .status(status)
                .totalAmount(new BigDecimal("1500000"))
                .build();
    }
}