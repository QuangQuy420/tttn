package com.tttn.userservice.service;

import com.tttn.userservice.dto.request.RegisterRequest;
import com.tttn.userservice.dto.response.UserResponse;

public interface AuthService {

    UserResponse register(RegisterRequest request);
}