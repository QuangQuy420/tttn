package com.tttn.orderservice.dto.response;

import java.util.List;
import java.util.UUID;

/**
 * Result of re-fetching every product in the cart — {@code changedVariantIds} lists the items
 * whose {@code unitPrice} or {@code available} flag changed during this refresh.
 */
public record CartRefreshResponse(
        CartResponse cart,
        List<UUID> changedVariantIds
) {
}
