package com.tttn.userservice.dto.response;

public record ApiResponse<T>(
        boolean success,
        String message,
        T data
) {

    public static <T> ApiResponse<T> success(String message, T data) {
        return new ApiResponse<>(true, message, data);
    }

    public static ApiResponse<Void> error(String message) {
        return new ApiResponse<>(false, message, null);
    }
}