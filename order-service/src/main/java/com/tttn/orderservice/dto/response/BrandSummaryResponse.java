package com.tttn.orderservice.dto.response;

import java.util.UUID;

public record BrandSummaryResponse(
        UUID id,
        String name,
        String logoUrl
) {
}