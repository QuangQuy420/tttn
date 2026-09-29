package com.tttn.orderservice.repository;

import com.tttn.orderservice.entity.OrderItem;
import com.tttn.orderservice.enums.OrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

@Repository
public interface OrderItemRepository extends JpaRepository<OrderItem, UUID> {

    List<OrderItem> findAllByOrderId(UUID orderId);

    void deleteAllByOrderId(UUID orderId);

    @Query("""
            select count(oi) > 0
            from OrderItem oi
            where oi.order.userId = :userId
              and oi.productId = :productId
              and oi.order.status in :statuses
            """)
    boolean existsPurchased(
            @Param("userId") UUID userId,
            @Param("productId") UUID productId,
            @Param("statuses") Collection<OrderStatus> statuses
    );
}