package com.tttn.orderservice.repository;

import com.tttn.orderservice.entity.OutboxEvent;
import com.tttn.orderservice.enums.OutboxStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface OutboxEventRepository extends JpaRepository<OutboxEvent, UUID> {

    // OutboxRelay: locks a batch of due rows for the current transaction. SKIP LOCKED lets several
    // order-service instances poll at once without picking the same row. :now comes from the app
    // clock (LocalDateTime.now()), the same clock that writes next_attempt_at.
    @Query(
            value = "SELECT * FROM outbox_events "
                    + "WHERE status = 'PENDING' AND next_attempt_at <= :now "
                    + "ORDER BY created_at "
                    + "LIMIT :batchSize "
                    + "FOR UPDATE SKIP LOCKED",
            nativeQuery = true
    )
    List<OutboxEvent> lockDueBatch(
            @Param("now") LocalDateTime now,
            @Param("batchSize") int batchSize
    );

    boolean existsByAggregateIdAndStatus(UUID aggregateId, OutboxStatus status);

    // SagaReconciliationJob: ignores rows that may stay PENDING for a long time on purpose
    // (refund / restock are never given up), so they do not block the order's other steps.
    boolean existsByAggregateIdAndStatusAndRoutingKeyNotIn(
            UUID aggregateId,
            OutboxStatus status,
            Collection<String> routingKeys
    );
}
