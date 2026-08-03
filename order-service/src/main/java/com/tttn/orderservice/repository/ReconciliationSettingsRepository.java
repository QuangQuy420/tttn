package com.tttn.orderservice.repository;

import com.tttn.orderservice.entity.ReconciliationSettings;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface ReconciliationSettingsRepository extends JpaRepository<ReconciliationSettings, UUID> {

    // reconciliation_settings is a single-row table (seeded once by V7, never inserted into
    // again) — this just fetches that one row without relying on knowing its id.
    Optional<ReconciliationSettings> findFirstByOrderByUpdatedAtDesc();
}
