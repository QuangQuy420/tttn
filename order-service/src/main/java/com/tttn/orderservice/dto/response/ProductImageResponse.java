package com.tttn.orderservice.dto.response;

import java.util.UUID;

public record ProductImageResponse(
        UUID id,
        UUID variantId,
        String imageUrl,
        Boolean isThumbnail,
        Integer sortOrder
) {
}