package com.tttn.orderservice.repository;

import com.tttn.orderservice.entity.OrderSagaLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

@Repository
public interface OrderSagaLogRepository extends JpaRepository<OrderSagaLog, UUID> {

    Page<OrderSagaLog> findByOrderId(UUID orderId, Pageable pageable);

    List<OrderSagaLog> findByOccurredAtBetweenOrderByOccurredAtDesc(
            LocalDateTime from,
            LocalDateTime to
    );

    // FR16 ("list of days that have logs"): occurredAt is LocalDateTime.now() in the JVM zone
    // (Asia/Ho_Chi_Minh, OrderServiceApplication), but Hibernate runs with jdbc.time_zone: UTC,
    // so the TIMESTAMP column holds the UTC wall time. A plain ::date would bucket by the UTC day
    // (a 02:00 VN log would land on the previous day); convert back to the VN day so this list
    // agrees with OrderSagaLogService.logsBetween, whose VN-day bounds go through the same
    // Hibernate conversion. Derived from the code, not yet verified on a live row.
    @Query(
            value = "SELECT DISTINCT (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date "
                    + "FROM order_saga_logs "
                    + "ORDER BY (occurred_at AT TIME ZONE 'UTC' AT TIME ZONE 'Asia/Ho_Chi_Minh')::date DESC",
            nativeQuery = true
    )
    List<LocalDate> findDistinctLogDates();
}
