package com.tttn.orderservice.config;

import com.tttn.orderservice.client.PaymentFeignClient;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.Configuration;

@Configuration(proxyBeanMethods = false)
@EnableFeignClients(
        basePackageClasses = PaymentFeignClient.class
)
public class FeignClientsConfig {
}