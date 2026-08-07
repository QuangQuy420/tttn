package com.tttn.orderservice.model.cart;

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

    public BigDecimal getSubtotal() {
        if (unitPrice == null || quantity == null) {
            return BigDecimal.ZERO;
        }

        return unitPrice.multiply(BigDecimal.valueOf(quantity));
    }
}