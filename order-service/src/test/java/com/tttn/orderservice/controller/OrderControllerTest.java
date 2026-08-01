package com.tttn.orderservice.controller;

import tools.jackson.databind.json.JsonMapper;
import com.tttn.orderservice.config.SecurityConfig;
import com.tttn.orderservice.dto.request.CancelOrderRequest;
import com.tttn.orderservice.dto.request.CheckoutRequest;
import com.tttn.orderservice.dto.request.UpdateOrderStatusRequest;
import com.tttn.orderservice.dto.response.CheckoutResponse;
import com.tttn.orderservice.dto.response.OrderResponse;
import com.tttn.orderservice.dto.response.OrderSummaryResponse;
import com.tttn.orderservice.dto.response.PageResponse;
import com.tttn.orderservice.enums.OrderStatus;
import com.tttn.orderservice.enums.PaymentStatus;
import com.tttn.orderservice.exception.BadRequestException;
import com.tttn.orderservice.exception.ConflictException;
import com.tttn.orderservice.exception.ExternalServiceException;
import com.tttn.orderservice.exception.GlobalExceptionHandler;
import com.tttn.orderservice.exception.ResourceNotFoundException;
import com.tttn.orderservice.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Nested;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(OrderController.class)
@Import({GlobalExceptionHandler.class, SecurityConfig.class})
@DisplayName("OrderController")
class OrderControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private JsonMapper jsonMapper;

    @MockitoBean
    private OrderService orderService;

    private UUID userId;
    private UUID orderId;
    private UUID paymentId;
    private UUID adminId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        orderId = UUID.randomUUID();
        paymentId = UUID.randomUUID();
        adminId = UUID.randomUUID();
    }

    @Nested
    @DisplayName("POST checkout")
    class CheckoutTests {

        @Test
        void checkout_WhenValid_ShouldReturnCreated() throws Exception {
            CheckoutResponse response = new CheckoutResponse(
                    orderId, "ORD-20260720-001", new BigDecimal("2400000"),
                    OrderStatus.PENDING, paymentId, PaymentStatus.PENDING,
                    "https://payment.example.com/pay"
            );

            when(orderService.checkout(eq(userId), any(CheckoutRequest.class)))
                    .thenReturn(response);

            mockMvc.perform(post("/api/v1/users/{userId}/checkout", userId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(jsonMapper.writeValueAsString(validCheckoutRequest())))
                    .andExpect(status().isCreated())
                    .andExpect(jsonPath("$.orderId").value(orderId.toString()))
                    .andExpect(jsonPath("$.orderCode").value("ORD-20260720-001"))
                    .andExpect(jsonPath("$.totalAmount").value(2400000))
                    .andExpect(jsonPath("$.orderStatus").value("PENDING"))
                    .andExpect(jsonPath("$.paymentId").value(paymentId.toString()))
                    .andExpect(jsonPath("$.paymentStatus").value("PENDING"));
        }

        @Test
        void checkout_WhenReceiverNameBlank_ShouldReturnBadRequest() throws Exception {
            Map<String, Object> request = Map.of(
                    "receiverName", "",
                    "receiverPhone", "0901234567",
                    "shippingAddress", "123 Nguyễn Trãi, TP.HCM",
                    "note", "Giao giờ hành chính",
                    "paymentMethod", "VNPAY"
            );

            mockMvc.perform(post("/api/v1/users/{userId}/checkout", userId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(jsonMapper.writeValueAsString(request)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.validationErrors.receiverName")
                            .value("Tên người nhận không được để trống"));

            verifyNoInteractions(orderService);
        }

        @Test
        void checkout_WhenPhoneInvalid_ShouldReturnBadRequest() throws Exception {
            Map<String, Object> request = Map.of(
                    "receiverName", "Nguyễn Văn A",
                    "receiverPhone", "123",
                    "shippingAddress", "123 Nguyễn Trãi, TP.HCM",
                    "note", "Giao giờ hành chính",
                    "paymentMethod", "VNPAY"
            );

            mockMvc.perform(post("/api/v1/users/{userId}/checkout", userId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(jsonMapper.writeValueAsString(request)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.validationErrors.receiverPhone")
                            .value("Số điện thoại không hợp lệ"));

            verifyNoInteractions(orderService);
        }

        @Test
        void checkout_WhenAddressBlank_ShouldReturnBadRequest() throws Exception {
            Map<String, Object> request = Map.of(
                    "receiverName", "Nguyễn Văn A",
                    "receiverPhone", "0901234567",
                    "shippingAddress", "",
                    "note", "Giao giờ hành chính",
                    "paymentMethod", "VNPAY"
            );

            mockMvc.perform(post("/api/v1/users/{userId}/checkout", userId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(jsonMapper.writeValueAsString(request)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.validationErrors.shippingAddress")
                            .value("Địa chỉ giao hàng không được để trống"));
        }

        @Test
        void checkout_WhenPaymentMethodBlank_ShouldReturnBadRequest() throws Exception {
            Map<String, Object> request = Map.of(
                    "receiverName", "Nguyễn Văn A",
                    "receiverPhone", "0901234567",
                    "shippingAddress", "123 Nguyễn Trãi, TP.HCM",
                    "note", "Giao giờ hành chính",
                    "paymentMethod", ""
            );

            mockMvc.perform(post("/api/v1/users/{userId}/checkout", userId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(jsonMapper.writeValueAsString(request)))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.validationErrors.paymentMethod")
                            .value("Phương thức thanh toán không được để trống"));
        }

        @Test
        void checkout_WhenCartEmpty_ShouldReturnBadRequest() throws Exception {
            when(orderService.checkout(eq(userId), any(CheckoutRequest.class)))
                    .thenThrow(new BadRequestException("Giỏ hàng đang trống"));

            mockMvc.perform(post("/api/v1/users/{userId}/checkout", userId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(jsonMapper.writeValueAsString(validCheckoutRequest())))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message").value("Giỏ hàng đang trống"));
        }

        @Test
        void checkout_WhenProductNotFound_ShouldReturnNotFound() throws Exception {
            when(orderService.checkout(eq(userId), any(CheckoutRequest.class)))
                    .thenThrow(new ResourceNotFoundException("Không tìm thấy sản phẩm"));

            mockMvc.perform(post("/api/v1/users/{userId}/checkout", userId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(jsonMapper.writeValueAsString(validCheckoutRequest())))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.message").value("Không tìm thấy sản phẩm"));
        }

        @Test
        void checkout_WhenPaymentFails_ShouldReturnBadGateway() throws Exception {
            when(orderService.checkout(eq(userId), any(CheckoutRequest.class)))
                    .thenThrow(new ExternalServiceException("Payment service unavailable"));

            mockMvc.perform(post("/api/v1/users/{userId}/checkout", userId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(jsonMapper.writeValueAsString(validCheckoutRequest())))
                    .andExpect(status().isBadGateway())
                    .andExpect(jsonPath("$.message").value("Payment service unavailable"));
        }
    }

    @Nested
    @DisplayName("GET orders")
    class GetOrdersTests {

        @Test
        void getOrders_WithoutParams_ShouldUseDefaults() throws Exception {
            PageResponse<OrderSummaryResponse> response = new PageResponse<>(
                    List.of(sampleOrderSummary()), 0, 20, 1, 1, true, true
            );

            when(orderService.getOrders(userId, null, 0, 20)).thenReturn(response);

            mockMvc.perform(get("/api/v1/users/{userId}/orders", userId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content.length()").value(1))
                    .andExpect(jsonPath("$.content[0].id").value(orderId.toString()))
                    .andExpect(jsonPath("$.content[0].status").value("PENDING"))
                    .andExpect(jsonPath("$.page").value(0))
                    .andExpect(jsonPath("$.size").value(20));

            verify(orderService).getOrders(userId, null, 0, 20);
        }

        @Test
        void getOrders_WithParams_ShouldPassParamsToService() throws Exception {
            PageResponse<OrderSummaryResponse> response =
                    new PageResponse<>(List.of(), 2, 5, 0, 0, false, true);

            when(orderService.getOrders(userId, OrderStatus.CONFIRMED, 2, 5))
                    .thenReturn(response);

            mockMvc.perform(get("/api/v1/users/{userId}/orders", userId)
                            .param("status", "CONFIRMED")
                            .param("page", "2")
                            .param("size", "5"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.content").isEmpty())
                    .andExpect(jsonPath("$.page").value(2))
                    .andExpect(jsonPath("$.size").value(5));
        }

        @Test
        void getOrders_WhenServiceRejectsPage_ShouldReturnBadRequest() throws Exception {
            when(orderService.getOrders(userId, null, -1, 20))
                    .thenThrow(new BadRequestException("Số trang không được nhỏ hơn 0"));

            mockMvc.perform(get("/api/v1/users/{userId}/orders", userId)
                            .param("page", "-1"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message")
                            .value("Số trang không được nhỏ hơn 0"));
        }
    }

    @Nested
    @DisplayName("GET order detail")
    class GetOrderDetailTests {

        @Test
        void getOrderDetail_WhenFound_ShouldReturnOk() throws Exception {
            when(orderService.getOrderDetail(userId, orderId))
                    .thenReturn(sampleOrderResponse(OrderStatus.PENDING, PaymentStatus.UNPAID));

            mockMvc.perform(get("/api/v1/users/{userId}/orders/{orderId}", userId, orderId))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.id").value(orderId.toString()))
                    .andExpect(jsonPath("$.userId").value(userId.toString()))
                    .andExpect(jsonPath("$.status").value("PENDING"))
                    .andExpect(jsonPath("$.paymentStatus").value("UNPAID"));
        }

        @Test
        void getOrderDetail_WhenNotFound_ShouldReturnNotFound() throws Exception {
            when(orderService.getOrderDetail(userId, orderId))
                    .thenThrow(new ResourceNotFoundException("Không tìm thấy đơn hàng"));

            mockMvc.perform(get("/api/v1/users/{userId}/orders/{orderId}", userId, orderId))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.message").value("Không tìm thấy đơn hàng"));
        }
    }

    @Nested
    @DisplayName("POST cancel order")
    class CancelOrderTests {

        @Test
        void cancelOrder_WhenValid_ShouldReturnOk() throws Exception {
            when(orderService.cancelOrder(eq(userId), eq(orderId), any(CancelOrderRequest.class)))
                    .thenReturn(sampleOrderResponse(OrderStatus.CANCELLED, PaymentStatus.UNPAID));

            mockMvc.perform(post("/api/v1/users/{userId}/orders/{orderId}/cancel", userId, orderId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\":\"Khách hàng đổi ý\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CANCELLED"));
        }

        @Test
        void cancelOrder_WhenReasonBlank_ShouldReturnBadRequest() throws Exception {
            mockMvc.perform(post("/api/v1/users/{userId}/orders/{orderId}/cancel", userId, orderId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\":\"\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.validationErrors.reason")
                            .value("Lý do hủy đơn không được để trống"));

            verifyNoInteractions(orderService);
        }

        @Test
        void cancelOrder_WhenNotFound_ShouldReturnNotFound() throws Exception {
            when(orderService.cancelOrder(eq(userId), eq(orderId), any(CancelOrderRequest.class)))
                    .thenThrow(new ResourceNotFoundException("Không tìm thấy đơn hàng"));

            mockMvc.perform(post("/api/v1/users/{userId}/orders/{orderId}/cancel", userId, orderId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\":\"Khách hàng đổi ý\"}"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.message").value("Không tìm thấy đơn hàng"));
        }

        @Test
        void cancelOrder_WhenConflict_ShouldReturnConflict() throws Exception {
            when(orderService.cancelOrder(eq(userId), eq(orderId), any(CancelOrderRequest.class)))
                    .thenThrow(new ConflictException("Đơn hàng đã được cập nhật trước đó"));

            mockMvc.perform(post("/api/v1/users/{userId}/orders/{orderId}/cancel", userId, orderId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"reason\":\"Khách hàng đổi ý\"}"))
                    .andExpect(status().isConflict())
                    .andExpect(jsonPath("$.message")
                            .value("Đơn hàng đã được cập nhật trước đó"));
        }
    }

    @Nested
    @DisplayName("PATCH update status")
    class UpdateStatusTests {

        @Test
        void updateStatus_WhenValid_ShouldReturnOk() throws Exception {
            when(orderService.updateOrderStatus(eq(orderId), eq(adminId), any(UpdateOrderStatusRequest.class)))
                    .thenReturn(sampleOrderResponse(OrderStatus.CONFIRMED, PaymentStatus.PAID));

            mockMvc.perform(patch("/api/v1/admin/orders/{orderId}/status", orderId)
                            .header("X-User-Id", adminId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"CONFIRMED\",\"note\":\"Admin xác nhận\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.status").value("CONFIRMED"));
        }

        @Test
        void updateStatus_WhenHeaderMissing_ShouldReturnBadRequest() throws Exception {
            mockMvc.perform(patch("/api/v1/admin/orders/{orderId}/status", orderId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"CONFIRMED\"}"))
                    .andExpect(status().isBadRequest());

            verifyNoInteractions(orderService);
        }

        @Test
        void updateStatus_WhenStatusMissing_ShouldReturnBadRequest() throws Exception {
            mockMvc.perform(patch("/api/v1/admin/orders/{orderId}/status", orderId)
                            .header("X-User-Id", adminId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"note\":\"Admin xác nhận\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.validationErrors.status")
                            .value("Trạng thái đơn hàng không được để trống"));
        }

        @Test
        void updateStatus_WhenNotFound_ShouldReturnNotFound() throws Exception {
            when(orderService.updateOrderStatus(eq(orderId), eq(adminId), any(UpdateOrderStatusRequest.class)))
                    .thenThrow(new ResourceNotFoundException("Không tìm thấy đơn hàng"));

            mockMvc.perform(patch("/api/v1/admin/orders/{orderId}/status", orderId)
                            .header("X-User-Id", adminId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"CONFIRMED\"}"))
                    .andExpect(status().isNotFound())
                    .andExpect(jsonPath("$.message").value("Không tìm thấy đơn hàng"));
        }

        @Test
        void updateStatus_WhenTransitionInvalid_ShouldReturnBadRequest() throws Exception {
            when(orderService.updateOrderStatus(eq(orderId), eq(adminId), any(UpdateOrderStatusRequest.class)))
                    .thenThrow(new BadRequestException(
                            "Không thể chuyển trạng thái từ PENDING sang SHIPPING"));

            mockMvc.perform(patch("/api/v1/admin/orders/{orderId}/status", orderId)
                            .header("X-User-Id", adminId)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"SHIPPING\"}"))
                    .andExpect(status().isBadRequest())
                    .andExpect(jsonPath("$.message")
                            .value("Không thể chuyển trạng thái từ PENDING sang SHIPPING"));
        }
    }

    @Test
    void unexpectedException_ShouldReturnInternalServerError() throws Exception {
        when(orderService.getOrderDetail(userId, orderId))
                .thenThrow(new RuntimeException("Database unavailable"));

        mockMvc.perform(get("/api/v1/users/{userId}/orders/{orderId}", userId, orderId))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.message").value("Đã xảy ra lỗi trong hệ thống"));
    }

    private CheckoutRequest validCheckoutRequest() {
        return new CheckoutRequest(
                "Nguyễn Văn A",
                "0901234567",
                "123 Nguyễn Trãi, Quận 1, TP.HCM",
                "Giao hàng trong giờ hành chính",
                "VNPAY",
                List.of(UUID.randomUUID())
        );
    }

    private OrderSummaryResponse sampleOrderSummary() {
        return new OrderSummaryResponse(
                orderId,
                "ORD-20260720-001",
                new BigDecimal("2400000"),
                OrderStatus.PENDING,
                "VNPAY",
                PaymentStatus.UNPAID,
                "Nguyễn Văn A",
                "0901234567",
                LocalDateTime.of(2026, 7, 20, 10, 30)
        );
    }

    private OrderResponse sampleOrderResponse(OrderStatus status, PaymentStatus paymentStatus) {
        return new OrderResponse(
                orderId,
                "ORD-20260720-001",
                userId,
                new BigDecimal("2400000"),
                status,
                paymentId,
                "VNPAY",
                paymentStatus,
                "Nguyễn Văn A",
                "0901234567",
                "123 Nguyễn Trãi, Quận 1, TP.HCM",
                "Giao hàng trong giờ hành chính",
                List.of(),
                List.of(),
                LocalDateTime.of(2026, 7, 20, 10, 30),
                LocalDateTime.of(2026, 7, 20, 10, 45)
        );
    }
}