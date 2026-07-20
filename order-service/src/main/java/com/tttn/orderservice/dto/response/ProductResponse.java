package com.tttn.orderservice.dto.response;

import com.tttn.orderservice.enums.ProductStatus;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;

public record ProductResponse(
        UUID id,
        String sku,
        String name,
        String slug,
        String description,
        String faceFitNote,
        String frameShape,
        String genderTarget,
        String material,
        BigDecimal basePrice,
        ProductStatus status,
        BrandSummaryResponse brand,
        CategorySummaryResponse category,
        List<ProductVariantResponse> variants,
        List<ProductImageResponse> images,
        List<String> faceShapes,
        OffsetDateTime createdAt,
        OffsetDateTime updatedAt
) {
}