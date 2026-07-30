package com.tttn.orderservice.repository;

import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.enums.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface OrderRepository extends JpaRepository<Order, UUID> {

    Optional<Order> findByOrderCode(String orderCode);

    Optional<Order> findByIdAndUserId(UUID id, UUID userId);

    Page<Order> findAllByUserId(UUID userId, Pageable pageable);

    Page<Order> findAllByUserIdAndStatus(
            UUID userId,
            OrderStatus status,
            Pageable pageable
    );

    Page<Order> findAllByStatus(OrderStatus status, Pageable pageable);

    @Query("select o.status, count(o) from Order o group by o.status")
    List<Object[]> countOrdersGroupedByStatus();

    boolean existsByOrderCode(String orderCode);
}