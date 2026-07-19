package com.tttn.orderservice.client;

import com.tttn.orderservice.dto.response.ProductResponse;

import java.util.UUID;

public interface ProductClient {

    ProductResponse getProductById(UUID productId);
}