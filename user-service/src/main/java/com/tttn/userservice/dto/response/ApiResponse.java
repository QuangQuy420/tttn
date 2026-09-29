package com.tttn.userservice.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.data.domain.Page;

import java.util.List;

public record ApiResponse<T>(
        boolean success,
        String message,
        T data,
        @JsonInclude(JsonInclude.Include.NON_NULL) PageMeta meta,
        @JsonInclude(JsonInclude.Include.NON_NULL) ErrorBody error
) {

    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>(true, message, data, null, null);
    }

    public static <T> ApiResponse<List<T>> page(String message, Page<T> page) {
        return new ApiResponse<>(true, message, page.getContent(), PageMeta.from(page), null);
    }

    public static ApiResponse<Void> error(String message, String code, Object details) {
        return new ApiResponse<>(false, message, null, null, new ErrorBody(code, details));
    }

    public record ErrorBody(
            String code,
            Object details
    ) {
    }
}
