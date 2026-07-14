package com.tttn.userservice.exception;

import lombok.Getter;
import org.springframework.http.HttpStatus;

@Getter
public enum ErrorCode {

    EMAIL_ALREADY_EXISTS(
            HttpStatus.CONFLICT,
            "Email đã được sử dụng"
    ),

    INVALID_TOKEN(
            HttpStatus.UNAUTHORIZED,
            "Token không hợp lệ hoặc đã hết hạn"
    ),
    PROFILE_NOT_FOUND(
            HttpStatus.NOT_FOUND,
            "Không tìm thấy hồ sơ người dùng"
    ),
    CURRENT_PASSWORD_INCORRECT(
            HttpStatus.BAD_REQUEST,
            "Mật khẩu hiện tại không chính xác"
    ),
    NEW_PASSWORD_SAME_AS_CURRENT(
            HttpStatus.BAD_REQUEST,
            "Mật khẩu mới không được giống mật khẩu hiện tại"
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
    RESET_TOKEN_INVALID(
            HttpStatus.BAD_REQUEST,
            "Reset token không hợp lệ"
    ),

    RESET_TOKEN_EXPIRED(
            HttpStatus.BAD_REQUEST,
            "Reset token đã hết hạn"
    ),

    RESET_TOKEN_USED(
            HttpStatus.BAD_REQUEST,
            "Reset token đã được sử dụng"
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