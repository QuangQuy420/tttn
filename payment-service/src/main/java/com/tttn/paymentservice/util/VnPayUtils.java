package com.tttn.paymentservice.util;

import jakarta.servlet.http.HttpServletRequest;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.stream.Collectors;

public final class VnPayUtils {

    private static final String HMAC_SHA_512 = "HmacSHA512";

    private VnPayUtils() {
    }

    public static String hmacSHA512(
            String secretKey,
            String data
    ) {
        try {
            Mac mac = Mac.getInstance(HMAC_SHA_512);

            SecretKeySpec secretKeySpec = new SecretKeySpec(
                    secretKey.getBytes(StandardCharsets.UTF_8),
                    HMAC_SHA_512
            );

            mac.init(secretKeySpec);

            byte[] result = mac.doFinal(
                    data.getBytes(StandardCharsets.UTF_8)
            );

            StringBuilder hex = new StringBuilder(result.length * 2);

            for (byte value : result) {
                hex.append(String.format("%02x", value));
            }

            return hex.toString();

        } catch (Exception exception) {
            throw new IllegalStateException(
                    "Không thể tạo chữ ký VNPay",
                    exception
            );
        }
    }

    public static String buildQueryString(
            Map<String, String> parameters
    ) {
        return parameters.entrySet()
                .stream()
                .filter(entry ->
                        entry.getValue() != null
                                && !entry.getValue().isBlank()
                )
                .sorted(Map.Entry.comparingByKey())
                .map(entry ->
                        encode(entry.getKey())
                                + "="
                                + encode(entry.getValue())
                )
                .collect(Collectors.joining("&"));
    }

    public static String getClientIp(
            HttpServletRequest request
    ) {
        String forwardedFor = request.getHeader("X-Forwarded-For");

        if (forwardedFor != null && !forwardedFor.isBlank()) {
            return forwardedFor.split(",")[0].trim();
        }

        String realIp = request.getHeader("X-Real-IP");

        if (realIp != null && !realIp.isBlank()) {
            return realIp.trim();
        }

        String remoteAddress = request.getRemoteAddr();

        if ("0:0:0:0:0:0:0:1".equals(remoteAddress)) {
            return "127.0.0.1";
        }

        return remoteAddress;
    }

    private static String encode(String value) {
        return URLEncoder.encode(
                value,
                StandardCharsets.UTF_8
        );
    }
}