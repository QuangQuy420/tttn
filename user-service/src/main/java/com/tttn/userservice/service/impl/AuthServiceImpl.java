package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.request.RegisterRequest;
import com.tttn.userservice.dto.response.UserResponse;
import com.tttn.userservice.entity.Profile;
import com.tttn.userservice.entity.User;
import com.tttn.userservice.enums.Role;
import com.tttn.userservice.enums.UserStatus;
import com.tttn.userservice.repository.ProfileRepository;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.AuthService;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import lombok.RequiredArgsConstructor;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import com.tttn.userservice.dto.request.LoginRequest;
import com.tttn.userservice.dto.response.AuthResponse;
import com.tttn.userservice.util.JwtUtil;


@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {
    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        String username = request.username().trim();

        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new BusinessException(ErrorCode.EMAIL_ALREADY_EXISTS);
        }

        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new BusinessException(ErrorCode.USERNAME_ALREADY_EXISTS);
        }

        User user = User.builder()
                .email(email)
                .username(username)
                .passwordHash(passwordEncoder.encode(request.password()))
                .role(Role.CUSTOMER)
                .status(UserStatus.ACTIVE)
                .build();

        user = userRepository.save(user);

        Profile profile = Profile.builder()
                .user(user)
                .fullName(request.fullName().trim())
                .phone(normalizeNullable(request.phone()))
                .build();

        profile = profileRepository.save(profile);

        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                user.getRole(),
                user.getStatus()
        );
    }

    private String normalizeNullable(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }

@Override
@Transactional(readOnly = true)
public AuthResponse login(LoginRequest request) {
    String identifier = request.identifier().trim();

    User user = userRepository.findByEmailIgnoreCase(identifier)
            .or(() -> userRepository.findByUsernameIgnoreCase(identifier))
            .orElseThrow(() ->
                    new BusinessException(ErrorCode.INVALID_CREDENTIALS)
            );

    if (!passwordEncoder.matches(
            request.password(),
            user.getPasswordHash()
    )) {
        throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
    }

    if (user.getStatus() != UserStatus.ACTIVE) {
        throw new BusinessException(ErrorCode.INVALID_CREDENTIALS);
    }

    String accessToken = jwtUtil.generateAccessToken(user);

    UserResponse userResponse = new UserResponse(
            user.getId(),
            user.getEmail(),
            user.getUsername(),
            user.getRole(),
            user.getStatus()
    );

    return new AuthResponse(
            accessToken,
            "Bearer",
            jwtUtil.getExpirationSeconds(),
            userResponse
    );
}
}