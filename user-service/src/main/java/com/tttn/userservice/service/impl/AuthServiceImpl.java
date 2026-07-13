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
import com.tttn.userservice.dto.request.ForgotPasswordRequest;
import com.tttn.userservice.dto.request.ResetPasswordRequest;
import com.tttn.userservice.entity.PasswordResetToken;
import com.tttn.userservice.repository.PasswordResetTokenRepository;
import lombok.extern.slf4j.Slf4j;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;


@Slf4j
@Service
@RequiredArgsConstructor
public class AuthServiceImpl implements AuthService {
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;
    private static final int RESET_TOKEN_EXPIRATION_MINUTES = 15;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    @Override
    @Transactional
    public UserResponse register(RegisterRequest request) {
        String email = request.email().trim().toLowerCase();
        String username = request.username()
                .trim()
                .toLowerCase();
        String fullName = request.fullName()
                .trim()
                .replaceAll("\\s+", " ");

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
                .fullName(fullName)
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
    String identifier = request.identifier()
            .trim()
            .toLowerCase();

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
    @Override
    @Transactional
    public void forgotPassword(ForgotPasswordRequest request) {
        String email = request.email()
                .trim()
                .toLowerCase();

        User user = userRepository.findByEmailIgnoreCase(email)
                .orElse(null);

        /*
         * Luôn trả về thành công kể cả email không tồn tại,
         * tránh tiết lộ tài khoản nào đã đăng ký.
         */
        if (user == null) {
            return;
        }

        passwordResetTokenRepository.deleteByUserId(user.getId());

        String rawToken = generateResetToken();
        String tokenHash = hashToken(rawToken);

        PasswordResetToken resetToken = PasswordResetToken.builder()
                .user(user)
                .tokenHash(tokenHash)
                .expiresAt(
                        LocalDateTime.now()
                                .plusMinutes(RESET_TOKEN_EXPIRATION_MINUTES)
                )
                .build();

        passwordResetTokenRepository.save(resetToken);

        /*
         * Chỉ dùng trong môi trường dev.
         * Sau này thay bằng gửi email.
         */
        log.info(
                "Password reset token for {}: {}",
                user.getEmail(),
                rawToken
        );
    }

    @Override
    @Transactional
    public void resetPassword(ResetPasswordRequest request) {
        String tokenHash = hashToken(request.token().trim());

        PasswordResetToken resetToken =
                passwordResetTokenRepository.findByTokenHash(tokenHash)
                        .orElseThrow(() ->
                                new BusinessException(
                                        ErrorCode.RESET_TOKEN_INVALID
                                )
                        );

        if (resetToken.isUsed()) {
            throw new BusinessException(
                    ErrorCode.RESET_TOKEN_USED
            );
        }

        if (resetToken.isExpired()) {
            throw new BusinessException(
                    ErrorCode.RESET_TOKEN_EXPIRED
            );
        }

        User user = resetToken.getUser();

        if (passwordEncoder.matches(
                request.newPassword(),
                user.getPasswordHash()
        )) {
            throw new BusinessException(
                    ErrorCode.NEW_PASSWORD_SAME_AS_CURRENT
            );
        }

        user.setPasswordHash(
                passwordEncoder.encode(request.newPassword())
        );

        resetToken.setUsedAt(LocalDateTime.now());

        userRepository.save(user);
        passwordResetTokenRepository.save(resetToken);
    }

    private String generateResetToken() {
        byte[] randomBytes = new byte[32];
        SECURE_RANDOM.nextBytes(randomBytes);

        return Base64.getUrlEncoder()
                .withoutPadding()
                .encodeToString(randomBytes);
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest =
                    MessageDigest.getInstance("SHA-256");

            byte[] hash = digest.digest(
                    rawToken.getBytes(StandardCharsets.UTF_8)
            );

            return java.util.HexFormat.of()
                    .formatHex(hash);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException(
                    "SHA-256 algorithm is not available",
                    exception
            );
        }
    }
}