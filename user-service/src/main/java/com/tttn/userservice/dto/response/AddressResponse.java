package com.tttn.userservice.dto.response;

import java.time.LocalDateTime;
import java.util.UUID;

public record AddressResponse(
        UUID id,
        String receiverName,
        String receiverPhone,
        String address,
        boolean isDefault,
        LocalDateTime createdAt
) {
}
