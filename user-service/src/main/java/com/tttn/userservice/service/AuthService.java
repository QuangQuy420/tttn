package com.tttn.userservice.service;

import com.tttn.userservice.dto.request.ForgotPasswordRequest;
import com.tttn.userservice.dto.request.LoginRequest;
import com.tttn.userservice.dto.request.RegisterRequest;
import com.tttn.userservice.dto.request.ResetPasswordRequest;
import com.tttn.userservice.dto.response.AuthResponse;
import com.tttn.userservice.dto.response.UserResponse;

public interface AuthService {

    UserResponse register(RegisterRequest request);

    AuthResponse login(LoginRequest request);

    void forgotPassword(ForgotPasswordRequest request);

    void resetPassword(ResetPasswordRequest request);
}