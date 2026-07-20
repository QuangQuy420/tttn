package com.tttn.orderservice;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

import java.net.URI;
import java.util.TimeZone;

@SpringBootApplication
public class OrderServiceApplication {

    public static void main(String[] args) {
        TimeZone.setDefault(TimeZone.getTimeZone("Asia/Ho_Chi_Minh"));
        applyEnvOverrides();
        SpringApplication.run(OrderServiceApplication.class, args);
    }

    // Docker/infra wires this service through the monorepo-wide PORT/DATABASE_URL/REDIS_URL
    // convention (see order-service/.env.example, infra/docker-compose.yml), but
    // application.yml's datasource/redis keys bind to the more granular SERVER_PORT/DB_URL/
    // DB_USERNAME/DB_PASSWORD/REDIS_HOST/REDIS_PORT properties instead. Map the monorepo env
    // vars onto the Spring properties they actually bind to, only when present, so local dev
    // outside Docker (which sets SERVER_PORT/DB_URL/... directly) is unaffected.
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

        String redisUrl = System.getenv("REDIS_URL");
        if (redisUrl != null && !redisUrl.isBlank()) {
            URI uri = URI.create(redisUrl);
            System.setProperty("spring.data.redis.host", uri.getHost());
            System.setProperty("spring.data.redis.port", String.valueOf(uri.getPort()));
            if (uri.getUserInfo() != null) {
                String[] credentials = uri.getUserInfo().split(":", 2);
                String password = credentials.length > 1 ? credentials[1] : credentials[0];
                System.setProperty("spring.data.redis.password", password);
            }
        }
    }
}