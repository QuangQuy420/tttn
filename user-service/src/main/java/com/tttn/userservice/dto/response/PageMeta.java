package com.tttn.userservice.dto.response;

import org.springframework.data.domain.Page;

public record PageMeta(
        int page,
        int limit,
        long total,
        int totalPages
) {

    public static PageMeta from(Page<?> page) {
        return new PageMeta(
                page.getNumber() + 1,
                page.getSize(),
                page.getTotalElements(),
                page.getTotalPages()
        );
    }
}
