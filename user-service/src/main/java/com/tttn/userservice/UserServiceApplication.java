package com.tttn.userservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.net.URI;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@SpringBootApplication
public class UserServiceApplication {

    public static void main(String[] args) {
        applyEnvOverrides();
        SpringApplication.run(UserServiceApplication.class, args);
    }

    // Docker/infra wires this service through the monorepo-wide PORT/DATABASE_URL/JWT_SECRET/
    // JWT_EXPIRES_IN convention (see user-service/.env.example, infra/docker-compose.yml), but
    // application.yml's datasource/port/jwt keys are hardcoded for local (non-Docker) dev. Map
    // the env vars onto the Spring properties they actually bind to, only when present, so
    // local dev without these vars set is unaffected.
    private static void applyEnvOverrides() {
        String databaseUrl = System.getenv("DATABASE_URL");
        if (databaseUrl != null && !databaseUrl.isBlank()) {
            URI uri = URI.create(databaseUrl);
            String[] credentials = uri.getUserInfo().split(":", 2);
            System.setProperty(
                    "spring.datasource.url",
                    "jdbc:postgresql://" + uri.getHost() + ":" + uri.getPort() + uri.getPath());
            System.setProperty("spring.datasource.username", credentials[0]);
            System.setProperty("spring.datasource.password", credentials[1]);
        }

        String port = System.getenv("PORT");
        if (port != null && !port.isBlank()) {
            System.setProperty("server.port", port);
        }

        String jwtSecret = System.getenv("JWT_SECRET");
        if (jwtSecret != null && !jwtSecret.isBlank()) {
            System.setProperty("jwt.secret", jwtSecret);
        }

        String internalApiKey = System.getenv("INTERNAL_API_KEY");
        if (internalApiKey != null && !internalApiKey.isBlank()) {
            System.setProperty("internal.api-key", internalApiKey);
        }

        String jwtExpiresIn = System.getenv("JWT_EXPIRES_IN");
        if (jwtExpiresIn != null && !jwtExpiresIn.isBlank()) {
            System.setProperty("jwt.expiration", String.valueOf(parseDurationMillis(jwtExpiresIn)));
        }
    }

    // Accepts the same shorthand as the jsonwebtoken npm package's `expiresIn` (e.g. "1d",
    // "12h", "30m"), which is what JWT_EXPIRES_IN's value in .env.example already looks like.
    // A bare number is treated as milliseconds, matching application.yml's jwt.expiration default.
    private static long parseDurationMillis(String value) {
        String trimmed = value.trim();
        if (trimmed.matches("\\d+")) {
            return Long.parseLong(trimmed);
        }

        Matcher matcher = Pattern.compile("^(\\d+)(ms|s|m|h|d)$").matcher(trimmed);
        if (!matcher.matches()) {
            throw new IllegalArgumentException("Unrecognized JWT_EXPIRES_IN value: " + value);
        }

        long amount = Long.parseLong(matcher.group(1));
        return switch (matcher.group(2)) {
            case "ms" -> amount;
            case "s" -> amount * 1_000L;
            case "m" -> amount * 60_000L;
            case "h" -> amount * 3_600_000L;
            case "d" -> amount * 86_400_000L;
            default -> throw new IllegalStateException("Unreachable");
        };
    }
}
