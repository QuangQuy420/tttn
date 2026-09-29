package com.tttn.orderservice.model.cart;

import com.tttn.orderservice.enums.CartItemUnavailableReason;
import lombok.*;

import java.io.Serializable;
import java.math.BigDecimal;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CartItem implements Serializable {

    private UUID productId;

    private UUID variantId;

    private String productName;

    private String skuVariant;

    private String color;

    private String colorHex;

    private String size;

    private String productImageUrl;

    private BigDecimal basePrice;

    private BigDecimal extraPrice;

    private BigDecimal unitPrice;

    private Integer quantity;

    // Availability fields are absent on carts saved before cart sync existed — null `available`
    // means available (see CartMapper.toItemResponse).
    private Boolean available;

    private CartItemUnavailableReason unavailableReason;

    private Integer availableStock;

    public BigDecimal getSubtotal() {
        if (unitPrice == null || quantity == null) {
            return BigDecimal.ZERO;
        }

        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}