package com.tttn.orderservice.exception;

import com.tttn.orderservice.dto.response.ApiErrorResponse;
import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;
import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(ResourceNotFoundException.class)
    public ResponseEntity<ApiErrorResponse> handleNotFound(
            ResourceNotFoundException exception
    ) {
        return buildResponse(
                HttpStatus.NOT_FOUND,
                exception.getMessage(),
                "NOT_FOUND",
                null
        );
    }

    @ExceptionHandler(BadRequestException.class)
    public ResponseEntity<ApiErrorResponse> handleBadRequest(
            BadRequestException exception
    ) {
        return buildResponse(
                HttpStatus.BAD_REQUEST,
                exception.getMessage(),
                exception.getCode(),
                null
        );
    }

    @ExceptionHandler(ConflictException.class)
    public ResponseEntity<ApiErrorResponse> handleConflict(
            ConflictException exception
    ) {
        return buildResponse(
                HttpStatus.CONFLICT,
                exception.getMessage(),
                "CONFLICT",
                null
        );
    }

    @ExceptionHandler(CartChangedException.class)
    public ResponseEntity<ApiErrorResponse> handleCartChanged(
            CartChangedException exception
    ) {
        return buildResponse(
                HttpStatus.CONFLICT,
                exception.getMessage(),
                "CART_CHANGED",
                exception.getChangedItems()
        );
    }

    @ExceptionHandler(ExternalServiceException.class)
    public ResponseEntity<ApiErrorResponse> handleExternalService(
            ExternalServiceException exception
    ) {
        return buildResponse(
                HttpStatus.BAD_GATEWAY,
                exception.getMessage(),
                "EXTERNAL_SERVICE_ERROR",
                null
        );
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiErrorResponse> handleValidation(
            MethodArgumentNotValidException exception
    ) {
        Map<String, String> errors = new LinkedHashMap<>();

        exception.getBindingResult()
                .getFieldErrors()
                .forEach(error ->
                        errors.putIfAbsent(
                                error.getField(),
                                error.getDefaultMessage()
                        )
                );

        return buildResponse(
                HttpStatus.BAD_REQUEST,
                "Dữ liệu gửi lên không hợp lệ",
                "VALIDATION_FAILED",
                errors
        );
    }

    @ExceptionHandler(ConstraintViolationException.class)
    public ResponseEntity<ApiErrorResponse> handleConstraintViolation(
            ConstraintViolationException exception
    ) {
        Map<String, String> errors = new LinkedHashMap<>();

        exception.getConstraintViolations()
                .forEach(violation ->
                        errors.put(
                                violation.getPropertyPath().toString(),
                                violation.getMessage()
                        )
                );

        return buildResponse(
                HttpStatus.BAD_REQUEST,
                "Tham số không hợp lệ",
                "VALIDATION_FAILED",
                errors
        );
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiErrorResponse> handleTypeMismatch(
            MethodArgumentTypeMismatchException exception
    ) {
        Map<String, String> errors = new LinkedHashMap<>();
        errors.put(exception.getName(), "Giá trị không hợp lệ");

        return buildResponse(
                HttpStatus.BAD_REQUEST,
                "Tham số không hợp lệ: " + exception.getName(),
                "VALIDATION_FAILED",
                errors
        );
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiErrorResponse> handleMissingRequestHeader(
            MissingRequestHeaderException exception
    ) {
        return buildResponse(
                HttpStatus.BAD_REQUEST,
                "Thiếu header bắt buộc: " + exception.getHeaderName(),
                "BAD_REQUEST",
                null
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiErrorResponse> handleUnexpected(
            Exception exception
    ) {
        // Spring MVC's own 4xx exceptions (unknown route, wrong method, unreadable body, ...)
        // carry their status — keep it instead of turning them into a 500.
        if (exception instanceof ErrorResponse errorResponse
                && errorResponse.getStatusCode().is4xxClientError()) {
            HttpStatusCode status = errorResponse.getStatusCode();

            return buildResponse(
                    status,
                    status.value() == HttpStatus.NOT_FOUND.value()
                            ? "Không tìm thấy đường dẫn yêu cầu"
                            : "Yêu cầu không hợp lệ",
                    codeFor(status),
                    null
            );
        }

        return buildResponse(
                HttpStatus.INTERNAL_SERVER_ERROR,
                "Đã xảy ra lỗi trong hệ thống",
                "INTERNAL_ERROR",
                null
        );
    }

    private String codeFor(HttpStatusCode status) {
        return switch (status.value()) {
            case 401 -> "UNAUTHORIZED";
            case 403 -> "FORBIDDEN";
            case 404 -> "NOT_FOUND";
            case 409 -> "CONFLICT";
            default -> "BAD_REQUEST";
        };
    }

    private ResponseEntity<ApiErrorResponse> buildResponse(
            HttpStatusCode status,
            String message,
            String code,
            Object details
    ) {
        return ResponseEntity
                .status(status)
                .body(ApiErrorResponse.of(message, code, details));
    }
}
