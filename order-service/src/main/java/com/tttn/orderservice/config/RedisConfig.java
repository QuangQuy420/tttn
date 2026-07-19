package com.tttn.orderservice.config;

import com.tttn.orderservice.model.cart.Cart;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.JacksonJsonRedisSerializer;
import org.springframework.data.redis.serializer.StringRedisSerializer;

@Configuration
public class RedisConfig {

    @Bean
    public RedisTemplate<String, Cart> cartRedisTemplate(
            RedisConnectionFactory connectionFactory
    ) {
        RedisTemplate<String, Cart> template = new RedisTemplate<>();

        JacksonJsonRedisSerializer<Cart> cartSerializer =
                new JacksonJsonRedisSerializer<>(Cart.class);

        StringRedisSerializer stringSerializer = new StringRedisSerializer();

        template.setConnectionFactory(connectionFactory);

        template.setKeySerializer(stringSerializer);
        template.setValueSerializer(cartSerializer);

        template.setHashKeySerializer(stringSerializer);
        template.setHashValueSerializer(cartSerializer);

        template.afterPropertiesSet();

        return template;
    }
}