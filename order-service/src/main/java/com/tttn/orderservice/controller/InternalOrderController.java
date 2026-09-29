package com.tttn.orderservice.controller;

import com.tttn.orderservice.dto.response.ApiResponse;
import com.tttn.orderservice.dto.response.PurchasedProductResponse;
import com.tttn.orderservice.service.OrderService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.UUID;

/**
 * Service-to-service endpoints. Protected by {@code InternalApiKeyFilter} ({@code X-Internal-Key}).
 */
@RestController
@RequestMapping("/internal/v1")
@RequiredArgsConstructor
public class InternalOrderController {

    private final OrderService orderService;

    @GetMapping("/users/{userId}/purchased-products/{productId}")
    public ResponseEntity<ApiResponse<PurchasedProductResponse>> hasPurchased(
            @PathVariable UUID userId,
            @PathVariable UUID productId
    ) {
        return ResponseEntity.ok(
                ApiResponse.ok(
                        new PurchasedProductResponse(
                                orderService.hasPurchased(userId, productId)
                        )
                )
        );
    }
}
