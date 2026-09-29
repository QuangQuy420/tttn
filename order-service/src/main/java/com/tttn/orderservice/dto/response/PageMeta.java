package com.tttn.orderservice.dto.response;

import org.springframework.data.domain.Page;

/**
 * Pagination block of a list envelope — {@code page} is 1-based (Spring's {@link Page} is
 * 0-based, converted here).
 */
public record PageMeta(
        int page,
        int limit,
        long total,
        int totalPages
) {

    public static PageMeta from(Page<?> pageData) {
        return new PageMeta(
                pageData.getNumber() + 1,
                pageData.getSize(),
                pageData.getTotalElements(),
                pageData.getTotalPages()
        );
    }
}
