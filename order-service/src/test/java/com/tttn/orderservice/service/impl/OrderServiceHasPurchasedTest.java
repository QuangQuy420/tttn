package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.client.ProductClient;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.mapper.OrderMapper;
import com.tttn.orderservice.messaging.OrderSagaEventPublisher;
import com.tttn.orderservice.repository.CheckoutIdempotencyKeyRepository;
import com.tttn.orderservice.repository.OrderItemRepository;
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

import java.util.Collection;
import java.util.EnumSet;
import java.util.UUID;
import tools.jackson.databind.json.JsonMapper;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
@DisplayName("OrderServiceImpl - hasPurchased")
class OrderServiceHasPurchasedTest {

    @Mock
    private OrderRepository orderRepository;

    @Mock
    private OrderItemRepository orderItemRepository;

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
    private CheckoutIdempotencyKeyRepository checkoutIdempotencyKeyRepository;

    private OrderServiceImpl orderService;

    @BeforeEach
    void setUp() {
        orderService = new OrderServiceImpl(
                orderRepository,
                orderItemRepository,
                cartService,
                productClient,
                orderSagaEventPublisher,
                orderMapper,
                orderSagaLogService,
                checkoutIdempotencyKeyRepository,
                JsonMapper.builder().build()
        );
    }

    @Test
    @DisplayName("Truyền đúng các trạng thái đã mua (CONFIRMED..COMPLETED) và trả kết quả repository")
    @SuppressWarnings("unchecked")
    void hasPurchased_ShouldQueryPaidStatusesAndReturnRepositoryResult() {
        UUID userId = UUID.randomUUID();
        UUID productId = UUID.randomUUID();
        when(orderItemRepository.existsPurchased(eq(userId), eq(productId), any()))
                .thenReturn(true);

        boolean result = orderService.hasPurchased(userId, productId);

        assertTrue(result);
        ArgumentCaptor<Collection<OrderStatus>> captor = ArgumentCaptor.forClass(Collection.class);
        verify(orderItemRepository).existsPurchased(eq(userId), eq(productId), captor.capture());
        assertEquals(
                EnumSet.of(
                        OrderStatus.CONFIRMED,
                        OrderStatus.PROCESSING,
                        OrderStatus.SHIPPING,
                        OrderStatus.DELIVERED,
                        OrderStatus.COMPLETED
                ),
                EnumSet.copyOf(captor.getValue())
        );
    }
}
