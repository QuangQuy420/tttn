package com.tttn.userservice.exception;

import com.tttn.userservice.dto.response.ApiResponse;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import java.util.LinkedHashMap;
import java.util.Map;

@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResponse<Void>> handleBusinessException(
            BusinessException exception
    ) {
        return toResponse(exception.getErrorCode(), null);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResponse<Void>> handleValidationException(
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

        return toResponse(ErrorCode.VALIDATION_FAILED, errors);
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<ApiResponse<Void>> handleTypeMismatchException(
            MethodArgumentTypeMismatchException exception
    ) {
        return toResponse(
                ErrorCode.VALIDATION_FAILED,
                Map.of(exception.getName(), "Giá trị không hợp lệ")
        );
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResponse<Void>> handleUnreadableBodyException(
            HttpMessageNotReadableException exception
    ) {
        return toResponse(ErrorCode.BAD_REQUEST, null);
    }

    @ExceptionHandler(MissingRequestHeaderException.class)
    public ResponseEntity<ApiResponse<Void>> handleMissingHeaderException(
            MissingRequestHeaderException exception
    ) {
        return toResponse(
                ErrorCode.BAD_REQUEST,
                Map.of(exception.getHeaderName(), "Thiếu header bắt buộc")
        );
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResponse<Void>> handleUnexpectedException(
            Exception exception,
            HttpServletRequest request
    ) {
        log.error("Unexpected error on {} {}", request.getMethod(), request.getRequestURI(), exception);

        return toResponse(ErrorCode.INTERNAL_SERVER_ERROR, null);
    }

    private ResponseEntity<ApiResponse<Void>> toResponse(ErrorCode errorCode, Object details) {
        return ResponseEntity
                .status(errorCode.getHttpStatus())
                .body(ApiResponse.error(
                        errorCode.getMessage(),
                        errorCode.name(),
                        details
                ));
    }
}
