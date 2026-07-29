package com.tttn.orderservice.config;

import com.tttn.orderservice.messaging.OrderSagaRoutingKeys;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.JacksonJavaTypeMapper;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Declares the {@code order-saga-events} topic exchange this service publishes to
 * (stock.reserve.requested / payment.create.requested / stock.release.requested) and the
 * durable queue it consumes saga replies from (stock.reserved / stock.reserve.rejected /
 * payment.completed / payment.failed) — see {@link com.tttn.orderservice.messaging.OrderSagaEventPublisher}
 * and {@link com.tttn.orderservice.messaging.OrderSagaEventListener}.
 */
@Configuration
public class RabbitMqConfig {

    public static final String ORDER_SERVICE_QUEUE = "order-saga-events.order-service";

    @Bean
    public TopicExchange orderSagaEventsExchange() {
        return new TopicExchange(OrderSagaRoutingKeys.EXCHANGE, true, false);
    }

    @Bean
    public Queue orderSagaEventsQueue() {
        return new Queue(ORDER_SERVICE_QUEUE, true);
    }

    @Bean
    public Binding stockReservedBinding(
            Queue orderSagaEventsQueue,
            TopicExchange orderSagaEventsExchange
    ) {
        return BindingBuilder
                .bind(orderSagaEventsQueue)
                .to(orderSagaEventsExchange)
                .with(OrderSagaRoutingKeys.STOCK_RESERVED);
    }

    @Bean
    public Binding stockReserveRejectedBinding(
            Queue orderSagaEventsQueue,
            TopicExchange orderSagaEventsExchange
    ) {
        return BindingBuilder
                .bind(orderSagaEventsQueue)
                .to(orderSagaEventsExchange)
                .with(OrderSagaRoutingKeys.STOCK_RESERVE_REJECTED);
    }

    @Bean
    public Binding paymentCompletedBinding(
            Queue orderSagaEventsQueue,
            TopicExchange orderSagaEventsExchange
    ) {
        return BindingBuilder
                .bind(orderSagaEventsQueue)
                .to(orderSagaEventsExchange)
                .with(OrderSagaRoutingKeys.PAYMENT_COMPLETED);
    }

    @Bean
    public Binding paymentFailedBinding(
            Queue orderSagaEventsQueue,
            TopicExchange orderSagaEventsExchange
    ) {
        return BindingBuilder
                .bind(orderSagaEventsQueue)
                .to(orderSagaEventsExchange)
                .with(OrderSagaRoutingKeys.PAYMENT_FAILED);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        JacksonJsonMessageConverter converter =
                new JacksonJsonMessageConverter();

        // product-service (raw amqplib, no __TypeId__ header) publishes into this queue too,
        // so the target Java type must come from the @RabbitListener method signature, not
        // from a type header only a Spring publisher would set.
        converter.setTypePrecedence(
                JacksonJavaTypeMapper.TypePrecedence.INFERRED
        );

        return converter;
    }
}
