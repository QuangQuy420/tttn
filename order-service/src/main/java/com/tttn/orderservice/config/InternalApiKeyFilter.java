package com.tttn.orderservice.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.tttn.orderservice.dto.response.ApiErrorResponse;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;
import org.springframework.web.util.UrlPathHelper;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

@Component
public class InternalApiKeyFilter extends OncePerRequestFilter {

    private static final String INTERNAL_PATH_PREFIX = "/internal/";
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Key";

    private final String internalApiKey;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final UrlPathHelper urlPathHelper = new UrlPathHelper();

    public InternalApiKeyFilter(
            @Value("${internal.api-key}") String internalApiKey
    ) {
        this.internalApiKey = internalApiKey;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        // Match on the decoded path (what MVC routes on), so "/%69nternal/..." cannot bypass the check.
        String path = urlPathHelper.getPathWithinApplication(request);

        if (!path.startsWith(INTERNAL_PATH_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String providedKey = request.getHeader(INTERNAL_KEY_HEADER);

        if (!isValidKey(providedKey)) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setCharacterEncoding("UTF-8");
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(
                    objectMapper.writeValueAsString(
                            ApiErrorResponse.of(
                                    "Yêu cầu nội bộ không hợp lệ",
                                    "INVALID_INTERNAL_KEY",
                                    null
                            )
                    )
            );
            return;
        }

        filterChain.doFilter(request, response);
    }

    // A blank configured key (e.g. INTERNAL_API_KEY= in .env) rejects every internal call.
    private boolean isValidKey(String providedKey) {
        if (internalApiKey == null || internalApiKey.isBlank()
                || providedKey == null || providedKey.isBlank()) {
            return false;
        }

        return MessageDigest.isEqual(
                providedKey.getBytes(StandardCharsets.UTF_8),
                internalApiKey.getBytes(StandardCharsets.UTF_8)
        );
    }
}
