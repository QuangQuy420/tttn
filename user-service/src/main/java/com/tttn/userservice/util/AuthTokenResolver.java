package com.tttn.userservice.util;

import com.tttn.userservice.entity.User;
import com.tttn.userservice.enums.UserStatus;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.UserRepository;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.UUID;

// Single place that turns an Authorization header into the caller's id. Beyond signature and
// expiry, the token is rejected when its user is gone or not ACTIVE, or when it was issued
// (iat, whole seconds) before the user's tokensValidAfter (password changed / reset).
@Component
@RequiredArgsConstructor
public class AuthTokenResolver {

    private static final String BEARER_PREFIX = "Bearer ";

    private final JwtUtil jwtUtil;
    private final UserRepository userRepository;

    public UUID resolveUserId(String authorizationHeader) {
        if (authorizationHeader == null
                || !authorizationHeader.startsWith(BEARER_PREFIX)) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        String token = authorizationHeader.substring(BEARER_PREFIX.length());

        Claims claims;
        UUID userId;

        try {
            claims = jwtUtil.extractClaims(token);
            userId = jwtUtil.extractUserId(claims);
        } catch (JwtException | IllegalArgumentException exception) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.INVALID_TOKEN));

        if (user.getStatus() != UserStatus.ACTIVE) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        Long tokensValidAfter = user.tokensValidAfterEpochSecond();
        Long issuedAt = jwtUtil.extractIssuedAtEpochSecond(claims);

        if (tokensValidAfter != null
                && (issuedAt == null || issuedAt < tokensValidAfter)) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        return userId;
    }
}
