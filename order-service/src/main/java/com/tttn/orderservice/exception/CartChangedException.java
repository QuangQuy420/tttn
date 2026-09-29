package com.tttn.orderservice.exception;

import com.tttn.orderservice.dto.response.CartChangedItemResponse;

import java.util.List;

/**
 * Thrown by checkout when a selected cart item's price or availability no longer matches
 * product-service — mapped to 409 {@code CART_CHANGED} with the changed items as details.
 */
public class CartChangedException extends RuntimeException {

    private final List<CartChangedItemResponse> changedItems;

    public CartChangedException(List<CartChangedItemResponse> changedItems) {
        super("Giỏ hàng đã thay đổi, vui lòng kiểm tra lại");
        this.changedItems = changedItems;
    }

    public List<CartChangedItemResponse> getChangedItems() {
        return changedItems;
    }
}
