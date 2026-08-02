package com.tttn.orderservice.repository;

import com.tttn.orderservice.entity.OrderSagaLog;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface OrderSagaLogRepository extends JpaRepository<OrderSagaLog, UUID> {

    List<OrderSagaLog> findByOrderIdOrderByOccurredAtAsc(UUID orderId);

    List<OrderSagaLog> findByOccurredAtBetweenOrderByOccurredAtDesc(
            LocalDateTime from,
            LocalDateTime to
    );

    // FR16 ("list of days that have logs"): occurred_at is stored in VN time (JVM default,
    // OrderServiceApplication:14) so a plain ::date cast already buckets by the right calendar
    // day — no separate timezone conversion needed (NFR6).
    @Query(
            value = "SELECT DISTINCT occurred_at::date "
                    + "FROM order_saga_logs "
                    + "ORDER BY occurred_at::date DESC",
            nativeQuery = true
    )
    List<LocalDate> findDistinctLogDates();
}
