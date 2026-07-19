package com.tttn.orderservice.mapper;

import com.tttn.orderservice.dto.response.CartItemResponse;
import com.tttn.orderservice.dto.response.CartResponse;
import com.tttn.orderservice.model.cart.Cart;
import com.tttn.orderservice.model.cart.CartItem;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;

@Component
public class CartMapper {

    public CartResponse toResponse(Cart cart) {
        List<CartItemResponse> items = cart.getItems() == null
                ? Collections.emptyList()
                : cart.getItems()
                .stream()
                .map(this::toItemResponse)
                .toList();

        return new CartResponse(
                cart.getUserId(),
                items,
                cart.getTotalQuantity(),
                cart.getTotalAmount(),
                cart.getCreatedAt(),
                cart.getUpdatedAt()
        );
    }

    public CartItemResponse toItemResponse(CartItem item) {
        return new CartItemResponse(
                item.getProductId(),
                item.getVariantId(),
                item.getProductName(),
                item.getSkuVariant(),
                item.getColor(),
                item.getSize(),
                item.getProductImageUrl(),
                item.getBasePrice(),
                item.getExtraPrice(),
                item.getUnitPrice(),
                item.getQuantity(),
                item.getSubtotal()
        );
    }
}