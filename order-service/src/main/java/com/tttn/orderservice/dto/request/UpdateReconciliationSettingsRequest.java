package com.tttn.orderservice.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;

public record UpdateReconciliationSettingsRequest(

        @NotNull(message = "Chu kỳ chạy job không được để trống")
        @Min(value = 10000, message = "Chu kỳ chạy job phải tối thiểu 10000 mili-giây")
        Integer intervalMs,

        @NotNull(message = "Ngưỡng phát hiện đơn bị kẹt không được để trống")
        @Min(value = 1, message = "Ngưỡng phát hiện đơn bị kẹt phải tối thiểu 1 phút")
        Integer stuckThresholdMinutes,

        @NotNull(message = "Số lần thử lại tối đa không được để trống")
        @Min(value = 1, message = "Số lần thử lại tối đa phải từ 1 đến 20")
        @Max(value = 20, message = "Số lần thử lại tối đa phải từ 1 đến 20")
        Integer maxAttempts
) {
}
