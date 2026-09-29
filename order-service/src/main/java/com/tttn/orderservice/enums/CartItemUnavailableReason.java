package com.tttn.orderservice.enums;

import com.tttn.orderservice.dto.response.ProductResponse;
import com.tttn.orderservice.dto.response.ProductVariantResponse;

/**
 * Why a cart item can't be checked out right now. Stored on the Redis cart item (null there
 * means "available", so carts written before this field existed stay valid).
 */
public enum CartItemUnavailableReason {
    PRODUCT_UNAVAILABLE,
    VARIANT_REMOVED,
    OUT_OF_STOCK,
    INSUFFICIENT_STOCK;

    /**
     * @param product  current product, or {@code null} when product-service returned 404
     * @param variant  current variant, or {@code null} when it no longer exists on the product
     * @return the reason the item is unavailable, or {@code null} when it can be ordered
     */
    public static CartItemUnavailableReason resolve(
            ProductResponse product,
            ProductVariantResponse variant,
            Integer quantity
    ) {
        if (product == null || product.status() != ProductStatus.PUBLISHED) {
            return PRODUCT_UNAVAILABLE;
        }

        if (variant == null) {
            return VARIANT_REMOVED;
        }

        int stock = variant.stock() == null ? 0 : variant.stock();

        if (stock <= 0) {
            return OUT_OF_STOCK;
        }

        if (quantity != null && quantity > stock) {
            return INSUFFICIENT_STOCK;
        }

        return null;
    }
}
