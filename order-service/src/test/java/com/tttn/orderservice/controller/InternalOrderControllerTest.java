package com.tttn.orderservice.controller;

import com.tttn.orderservice.config.InternalApiKeyFilter;
import com.tttn.orderservice.config.SecurityConfig;
import com.tttn.orderservice.exception.GlobalExceptionHandler;
import com.tttn.orderservice.service.OrderService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.mockito.ArgumentMatchers.any;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(InternalOrderController.class)
@Import({GlobalExceptionHandler.class, SecurityConfig.class, InternalApiKeyFilter.class})
@TestPropertySource(properties = "internal.api-key=test-internal-key")
@DisplayName("InternalOrderController")
class InternalOrderControllerTest {

    private static final String URL = "/internal/v1/users/{userId}/purchased-products/{productId}";

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private OrderService orderService;

    private UUID userId;
    private UUID productId;

    @BeforeEach
    void setUp() {
        userId = UUID.randomUUID();
        productId = UUID.randomUUID();
    }

    @Test
    @DisplayName("Đúng X-Internal-Key → 200, data.purchased = true")
    void hasPurchased_WhenKeyValid_ShouldReturnPurchasedTrue() throws Exception {
        when(orderService.hasPurchased(userId, productId)).thenReturn(true);

        mockMvc.perform(get(URL, userId, productId)
                        .header("X-Internal-Key", "test-internal-key"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.purchased").value(true));

        verify(orderService).hasPurchased(userId, productId);
    }

    @Test
    @DisplayName("Thiếu X-Internal-Key → 403 INVALID_INTERNAL_KEY")
    void hasPurchased_WhenKeyMissing_ShouldReturnForbidden() throws Exception {
        mockMvc.perform(get(URL, userId, productId))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.success").value(false))
                .andExpect(jsonPath("$.error.code").value("INVALID_INTERNAL_KEY"));

        verify(orderService, never()).hasPurchased(any(), any());
    }
}
