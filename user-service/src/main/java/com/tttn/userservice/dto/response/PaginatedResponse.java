package com.tttn.userservice.dto.response;

import java.util.List;

public record PaginatedResponse<T>(
        List<T> items,
        long total,
        int page,
        int limit,
        int totalPages
) {
}
