package com.tttn.orderservice.util;

import com.tttn.orderservice.exception.BadRequestException;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

import java.util.List;

/**
 * Shared list pagination rules: {@code page} is 1-based, {@code limit} is 1..100 (default 20
 * at the controller). Invalid values fail with 400 {@code VALIDATION_FAILED}.
 */
public final class PageRequests {

    public static final int MAX_LIMIT = 100;

    private static final String VALIDATION_FAILED = "VALIDATION_FAILED";

    private PageRequests() {
    }

    public static PageRequest of(int page, int limit) {
        return of(page, limit, Sort.unsorted());
    }

    public static PageRequest of(int page, int limit, Sort sort) {
        if (page < 1) {
            throw new BadRequestException(
                    "Trang phải lớn hơn hoặc bằng 1",
                    VALIDATION_FAILED
            );
        }

        if (limit < 1 || limit > MAX_LIMIT) {
            throw new BadRequestException(
                    "Số lượng mỗi trang phải từ 1 đến " + MAX_LIMIT,
                    VALIDATION_FAILED
            );
        }

        return PageRequest.of(page - 1, limit, sort);
    }

    /**
     * Paginates a list already built in memory (e.g. aggregated saga-log rows).
     */
    public static <T> Page<T> slice(List<T> all, PageRequest pageable) {
        int from = (int) Math.min(pageable.getOffset(), all.size());
        int to = Math.min(from + pageable.getPageSize(), all.size());

        return new PageImpl<>(all.subList(from, to), pageable, all.size());
    }
}
