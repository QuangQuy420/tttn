package com.tttn.orderservice.config;

import com.tttn.orderservice.messaging.OrderSagaRoutingKeys;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.support.converter.JacksonJavaTypeMapper;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * Declares the {@code order-saga-events} topic exchange this service publishes to
 * (stock.reserve.requested / payment.create.requested / stock.release.requested) and the
 * durable queue it consumes saga replies from (stock.reserved / stock.reserve.rejected /
 * payment.completed / payment.failed) — see {@link com.tttn.orderservice.messaging.OrderSagaEventPublisher}
 * and {@link com.tttn.orderservice.messaging.OrderSagaEventListener}.
 *
 * <p>Also declares the shared dead-letter exchange/queue (FR10-FR12): {@link #orderSagaEventsQueue}
 * is a quorum queue with {@code x-dead-letter-exchange}/{@code x-delivery-limit} set, so any
 * message nacked without requeue (malformed payload) or redelivered past the limit is routed by
 * the broker to {@code order-saga-events.dlq} instead of being dropped or requeued forever — see
 * {@link com.tttn.orderservice.messaging.DeadLetterListener}.
 */
@Configuration
public class RabbitMqConfig {

    public static final String ORDER_SERVICE_QUEUE = "order-saga-events.order-service";
    public static final String ORDER_SAGA_EVENTS_DLX = "order-saga-events.dlx";
    public static final String ORDER_SAGA_EVENTS_DLQ = "order-saga-events.dlq";

    @Bean
    public TopicExchange orderSagaEventsExchange() {
        return new TopicExchange(OrderSagaRoutingKeys.EXCHANGE, true, false);
    }

    @Bean
    public Queue orderSagaEventsQueue(
            @Value("${app.saga.delivery-limit}")
            int deliveryLimit
    ) {
        return QueueBuilder.durable(ORDER_SERVICE_QUEUE)
                .quorum()
                .deadLetterExchange(ORDER_SAGA_EVENTS_DLX)
                .deliveryLimit(deliveryLimit)
                .build();
    }

    @Bean
    public FanoutExchange orderSagaEventsDlx() {
        return new FanoutExchange(ORDER_SAGA_EVENTS_DLX, true, false);
    }

    @Bean
    public Queue orderSagaEventsDlq() {
        return new Queue(ORDER_SAGA_EVENTS_DLQ, true);
    }

    @Bean
    public Binding orderSagaEventsDlqBinding(
            Queue orderSagaEventsDlq,
            FanoutExchange orderSagaEventsDlx
    ) {
        return BindingBuilder
                .bind(orderSagaEventsDlq)
                .to(orderSagaEventsDlx);
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
