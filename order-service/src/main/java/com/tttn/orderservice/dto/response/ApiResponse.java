package com.tttn.orderservice.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.data.domain.Page;

import java.util.List;

/**
 * Success envelope shared by every service: {@code {success, message, data}} plus
 * {@code meta} on list responses only (omitted from JSON when null).
 */
public record ApiResponse<T>(
        boolean success,
        String message,
        T data,
        @JsonInclude(JsonInclude.Include.NON_NULL)
        PageMeta meta
) {

    public static final String DEFAULT_MESSAGE = "Thành công";

    public static <T> ApiResponse<T> ok(T data) {
        return ok(DEFAULT_MESSAGE, data);
    }

    public static <T> ApiResponse<T> ok(String message, T data) {
        return new ApiResponse<>(true, message, data, null);
    }

    public static <T> ApiResponse<List<T>> page(Page<T> pageData) {
        return new ApiResponse<>(
                true,
                DEFAULT_MESSAGE,
                pageData.getContent(),
                PageMeta.from(pageData)
        );
    }
}
