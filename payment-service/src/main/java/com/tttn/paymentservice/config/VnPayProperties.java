package com.tttn.paymentservice.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "vnpay")
public record VnPayProperties(
        String version,
        String command,
        String tmnCode,
        String hashSecret,
        String paymentUrl,
        String returnUrl,
        String ipnUrl,
        String orderType,
        String locale,
        int expireMinutes
) {
}