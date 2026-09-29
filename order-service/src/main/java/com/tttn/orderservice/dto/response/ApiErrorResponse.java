package com.tttn.orderservice.dto.response;

/**
 * Error envelope shared by every service: {@code {success:false, message, error:{code, details}}}.
 */
public record ApiErrorResponse(
        boolean success,
        String message,
        ErrorBody error
) {

    public static ApiErrorResponse of(
            String message,
            String code,
            Object details
    ) {
        return new ApiErrorResponse(
                false,
                message,
                new ErrorBody(code, details)
        );
    }
}
