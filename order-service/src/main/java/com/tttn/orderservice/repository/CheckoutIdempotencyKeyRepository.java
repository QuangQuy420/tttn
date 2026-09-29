package com.tttn.orderservice.repository;

import com.tttn.orderservice.entity.CheckoutIdempotencyKey;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface CheckoutIdempotencyKeyRepository extends JpaRepository<CheckoutIdempotencyKey, UUID> {

    Optional<CheckoutIdempotencyKey> findByUserIdAndIdempotencyKey(
            UUID userId,
            String idempotencyKey
    );

    // Bulk delete (no entity loading); caller provides the transaction.
    @Modifying
    @Query("delete from CheckoutIdempotencyKey k where k.expiresAt < :now")
    int deleteByExpiresAtBefore(@Param("now") LocalDateTime now);
}
