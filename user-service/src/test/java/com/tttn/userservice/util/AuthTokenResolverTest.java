package com.tttn.userservice.util;

import com.tttn.userservice.entity.User;
import com.tttn.userservice.enums.UserStatus;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.UserRepository;
import io.jsonwebtoken.Jwts;
import io.jsonwebtoken.io.Decoders;
import io.jsonwebtoken.security.Keys;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDateTime;
import java.util.Date;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AuthTokenResolverTest {

    // Test-only key: Base64 of 32 bytes (HS256 minimum).
    private static final String SECRET = "MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=";
    private static final Date FAR_FUTURE = Date.from(Instant.parse("2100-01-01T00:00:00Z"));

    @Mock
    private UserRepository userRepository;

    private AuthTokenResolver resolver;

    @BeforeEach
    void setUp() {
        resolver = new AuthTokenResolver(new JwtUtil(SECRET, 3_600_000L), userRepository);
    }

    @Test
    void resolveUserId_tokenIssuedBeforePasswordChange_isRejected_AC8() {
        User user = activeUserWithTokensValidAfter(LocalDateTime.of(2026, 1, 1, 0, 0, 10));
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        String header = bearer(user.getId(), Instant.parse("2026-01-01T00:00:09Z"));

        assertThatThrownBy(() -> resolver.resolveUserId(header))
                .isInstanceOfSatisfying(BusinessException.class, exception ->
                        assertThat(exception.getErrorCode())
                                .isEqualTo(ErrorCode.INVALID_TOKEN));
    }

    @Test
    void resolveUserId_tokenIssuedInSameSecondAsPasswordChange_isAccepted_AC8() {
        User user = activeUserWithTokensValidAfter(LocalDateTime.of(2026, 1, 1, 0, 0, 10));
        when(userRepository.findById(user.getId())).thenReturn(Optional.of(user));
        String header = bearer(user.getId(), Instant.parse("2026-01-01T00:00:10Z"));

        assertThat(resolver.resolveUserId(header)).isEqualTo(user.getId());
    }

    private static User activeUserWithTokensValidAfter(LocalDateTime tokensValidAfterUtc) {
        User user = User.builder()
                .email("a@example.com")
                .username("alice")
                .status(UserStatus.ACTIVE)
                .tokensValidAfter(tokensValidAfterUtc)
                .build();
        user.setId(UUID.randomUUID());
        return user;
    }

    private static String bearer(UUID userId, Instant issuedAt) {
        String token = Jwts.builder()
                .subject("alice")
                .claim("userId", userId.toString())
                .issuedAt(Date.from(issuedAt))
                .expiration(FAR_FUTURE)
                .signWith(Keys.hmacShaKeyFor(Decoders.BASE64.decode(SECRET)))
                .compact();
        return "Bearer " + token;
    }
}
