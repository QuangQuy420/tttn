package com.tttn.userservice.util;

import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

public final class PageRequests {

    public static final int MAX_LIMIT = 100;

    private PageRequests() {
    }

    // page is 1-based on the API, 0-based in Spring Data.
    public static PageRequest of(int page, int limit, Sort sort) {
        if (page < 1 || limit < 1 || limit > MAX_LIMIT) {
            throw new BusinessException(ErrorCode.VALIDATION_FAILED);
        }

        return PageRequest.of(page - 1, limit, sort);
    }
}
