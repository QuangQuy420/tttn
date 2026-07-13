package com.tttn.userservice.controller;

import com.tttn.userservice.dto.request.RegisterRequest;
import com.tttn.userservice.dto.response.ApiResponse;
import com.tttn.userservice.dto.response.UserResponse;
import com.tttn.userservice.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import com.tttn.userservice.dto.request.LoginRequest;
import com.tttn.userservice.dto.response.AuthResponse;
import com.tttn.userservice.dto.request.ForgotPasswordRequest;
import com.tttn.userservice.dto.request.ResetPasswordRequest;

@RestController
@RequestMapping("/api/v1/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/register")
    public ResponseEntity<ApiResponse<UserResponse>> register(
            @Valid @RequestBody RegisterRequest request
    ) {
        UserResponse userResponse = authService.register(request);

        return ResponseEntity
                .status(HttpStatus.CREATED)
                .body(ApiResponse.success(
                        "Đăng ký tài khoản thành công",
                        userResponse
                ));
    }
    @PostMapping("/login")
    public ResponseEntity<ApiResponse<AuthResponse>> login(
            @Valid @RequestBody LoginRequest request
    ) {
        AuthResponse authResponse = authService.login(request);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Đăng nhập thành công",
                        authResponse
                )
        );
    }
    @PostMapping("/forgot-password")
    public ResponseEntity<ApiResponse<Void>> forgotPassword(
            @Valid @RequestBody ForgotPasswordRequest request
    ) {
        authService.forgotPassword(request);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Nếu email tồn tại, hướng dẫn đặt lại mật khẩu đã được tạo",
                        null
                )
        );
    }

    @PostMapping("/reset-password")
    public ResponseEntity<ApiResponse<Void>> resetPassword(
            @Valid @RequestBody ResetPasswordRequest request
    ) {
        authService.resetPassword(request);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Đặt lại mật khẩu thành công",
                        null
                )
        );
    }
}