package com.tttn.orderservice.dto.response;

/**
 * {@code error} block of the error envelope — {@code code} is a stable UPPER_SNAKE value for
 * clients to branch on, {@code details} is optional extra data (field errors, changed items).
 */
public record ErrorBody(
        String code,
        Object details
) {
}
