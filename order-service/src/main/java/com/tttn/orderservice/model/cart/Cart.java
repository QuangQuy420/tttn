package com.tttn.orderservice.model.cart;

import lombok.*;

import java.io.Serializable;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Cart implements Serializable {

    private UUID userId;

    @Builder.Default
    private List<CartItem> items = new ArrayList<>();

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;

    // Totals (and the header badge) count available items only; an unavailable item stays in the
    // cart with its reason. available == null (older snapshots) counts as available.
    public Integer getTotalQuantity() {
        if (items == null) {
            return 0;
        }

        return items.stream()
                .filter(Cart::countsTowardTotals)
                .map(CartItem::getQuantity)
                .filter(quantity -> quantity != null)
                .reduce(0, Integer::sum);
    }

    public BigDecimal getTotalAmount() {
        if (items == null) {
            return BigDecimal.ZERO;
        }

        return items.stream()
                .filter(Cart::countsTowardTotals)
                .map(CartItem::getSubtotal)
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private static boolean countsTowardTotals(CartItem item) {
        return !Boolean.FALSE.equals(item.getAvailable());
    }

    public boolean isEmpty() {
        return items == null || items.isEmpty();
    }
}