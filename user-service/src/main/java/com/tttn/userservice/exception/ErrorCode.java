package com.tttn.userservice.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public enum ErrorCode {

    EMAIL_ALREADY_EXISTS(
            HttpStatus.CONFLICT,
            "Email đã được sử dụng"
    ),

    USERNAME_ALREADY_EXISTS(
            HttpStatus.CONFLICT,
            "Username đã được sử dụng"
    ),

    USER_NOT_FOUND(
            HttpStatus.NOT_FOUND,
            "Không tìm thấy người dùng"
    ),

    INVALID_CREDENTIALS(
            HttpStatus.UNAUTHORIZED,
            "Email, username hoặc mật khẩu không chính xác"
    ),

    VALIDATION_FAILED(
            HttpStatus.BAD_REQUEST,
            "Dữ liệu đầu vào không hợp lệ"
    ),

    INTERNAL_SERVER_ERROR(
            HttpStatus.INTERNAL_SERVER_ERROR,
            "Đã xảy ra lỗi hệ thống"
    );

    private final HttpStatus httpStatus;
    private final String message;

    ErrorCode(HttpStatus httpStatus, String message) {
        this.httpStatus = httpStatus;
        this.message = message;
    }
}