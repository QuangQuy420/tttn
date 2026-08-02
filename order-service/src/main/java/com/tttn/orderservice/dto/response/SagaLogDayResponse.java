package com.tttn.orderservice.dto.response;

import java.time.LocalDate;

public record SagaLogDayResponse(
        LocalDate date,
        long totalCount,
        boolean hasWarning
) {
}
