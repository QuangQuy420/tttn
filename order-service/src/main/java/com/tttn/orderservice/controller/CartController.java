package com.tttn.orderservice.controller;

import com.tttn.orderservice.dto.request.AddCartItemRequest;
import com.tttn.orderservice.dto.request.UpdateCartItemRequest;
import com.tttn.orderservice.dto.response.CartResponse;
import com.tttn.orderservice.service.CartService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/carts")
@RequiredArgsConstructor
public class CartController {

    private final CartService cartService;

    @GetMapping("/{userId}")
    public ResponseEntity<CartResponse> getCart(
            @PathVariable UUID userId
    ) {
        return ResponseEntity.ok(
                cartService.getCart(userId)
        );
    }

    @PostMapping("/{userId}/items")
    public ResponseEntity<CartResponse> addItem(
            @PathVariable UUID userId,
            @Valid @RequestBody AddCartItemRequest request
    ) {
        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(cartService.addItem(userId, request));
    }

    @PutMapping("/{userId}/items/{variantId}")
    public ResponseEntity<CartResponse> updateItem(
            @PathVariable UUID userId,
            @PathVariable UUID variantId,
            @Valid @RequestBody UpdateCartItemRequest request
    ) {
        return ResponseEntity.ok(
                cartService.updateItem(
                        userId,
                        variantId,
                        request
                )
        );
    }

    @DeleteMapping("/{userId}/items/{variantId}")
    public ResponseEntity<CartResponse> removeItem(
            @PathVariable UUID userId,
            @PathVariable UUID variantId
    ) {
        return ResponseEntity.ok(
                cartService.removeItem(userId, variantId)
        );
    }

    @DeleteMapping("/{userId}")
    public ResponseEntity<Void> clearCart(
            @PathVariable UUID userId
    ) {
        cartService.clearCart(userId);

        return ResponseEntity.noContent().build();
    }
}