package com.tttn.orderservice.repository;

import com.tttn.orderservice.entity.Order;
import com.tttn.orderservice.enums.OrderStatus;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

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

    boolean existsByOrderCode(String orderCode);
}