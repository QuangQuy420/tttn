package com.tttn.userservice.config;

import com.tttn.userservice.dto.response.ApiResponse;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

@Component
public class InternalApiKeyFilter extends OncePerRequestFilter {

    private static final String INTERNAL_PATH_PREFIX = "/internal/";
    private static final String INTERNAL_KEY_HEADER = "X-Internal-Key";

    private final String internalApiKey;
    private final ObjectMapper objectMapper = new ObjectMapper();

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
        if (!request.getRequestURI().startsWith(INTERNAL_PATH_PREFIX)) {
            filterChain.doFilter(request, response);
            return;
        }

        String providedKey = request.getHeader(INTERNAL_KEY_HEADER);

        if (providedKey == null || !providedKey.equals(internalApiKey)) {
            response.setStatus(HttpStatus.FORBIDDEN.value());
            response.setCharacterEncoding("UTF-8");
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write(
                    objectMapper.writeValueAsString(
                            ApiResponse.error("Yêu cầu nội bộ không hợp lệ")
                    )
            );
            return;
        }

        filterChain.doFilter(request, response);
    }
}
