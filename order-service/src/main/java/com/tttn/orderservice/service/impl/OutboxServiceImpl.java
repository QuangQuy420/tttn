package com.tttn.orderservice.service.impl;

import com.tttn.orderservice.entity.OutboxEvent;
import com.tttn.orderservice.enums.OutboxStatus;
import com.tttn.orderservice.repository.OutboxEventRepository;
import com.tttn.orderservice.service.OutboxService;
import lombok.RequiredArgsConstructor;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.time.LocalDateTime;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class OutboxServiceImpl implements OutboxService {

    private final OutboxEventRepository outboxEventRepository;

    // Same converter RabbitTemplate used for convertAndSend (RabbitMqConfig.jsonMessageConverter),
    // so the stored JSON body matches what consumers received before the outbox.
    private final MessageConverter jsonMessageConverter;

    @Override
    @Transactional(propagation = Propagation.MANDATORY)
    public void enqueue(
            String exchange,
            String routingKey,
            String aggregateType,
            UUID aggregateId,
            Object event
    ) {
        Message message = jsonMessageConverter.toMessage(
                event,
                new MessageProperties()
        );

        LocalDateTime now = LocalDateTime.now();

        OutboxEvent outboxEvent = OutboxEvent.builder()
                .aggregateType(aggregateType)
                .aggregateId(aggregateId)
                .exchange(exchange)
                .routingKey(routingKey)
                .payload(new String(message.getBody(), StandardCharsets.UTF_8))
                .status(OutboxStatus.PENDING)
                .attempts(0)
                .nextAttemptAt(now)
                .createdAt(now)
                .build();

        outboxEventRepository.save(outboxEvent);
    }
}
