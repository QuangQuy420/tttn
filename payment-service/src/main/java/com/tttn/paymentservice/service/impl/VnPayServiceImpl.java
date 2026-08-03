package com.tttn.paymentservice.service.impl;

import com.tttn.paymentservice.config.VnPayProperties;
import com.tttn.paymentservice.entity.Payment;
import com.tttn.paymentservice.service.VnPayService;
import com.tttn.paymentservice.util.VnPayUtils;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import java.util.TreeMap;

@Service
@RequiredArgsConstructor
public class VnPayServiceImpl implements VnPayService {

    private static final ZoneId VIETNAM_ZONE =
            ZoneId.of("Asia/Ho_Chi_Minh");

    private static final DateTimeFormatter VNPAY_DATE_FORMAT =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final VnPayProperties properties;

    @Override
    public String createPaymentUrl(
            Payment payment,
            String clientIp
    ) {
        validateConfiguration();

        LocalDateTime createdAt =
                LocalDateTime.now(VIETNAM_ZONE);

        LocalDateTime expireAt = createdAt.plusMinutes(
                properties.expireMinutes()
        );

        /*
         * VNPay yêu cầu số tiền nhân 100.
         * Ví dụ 150000 VND → 15000000.
         */
        String vnpAmount = payment.getAmount()
                .multiply(BigDecimal.valueOf(100))
                .setScale(0, RoundingMode.UNNECESSARY)
                .toPlainString();

        /*
         * Dùng Payment UUID làm mã tham chiếu duy nhất.
         */
        String transactionReference =
                payment.getId().toString();

        Map<String, String> parameters = new TreeMap<>();

        parameters.put(
                "vnp_Version",
                properties.version()
        );
        parameters.put(
                "vnp_Command",
                properties.command()
        );
        parameters.put(
                "vnp_TmnCode",
                properties.tmnCode()
        );
        parameters.put(
                "vnp_Amount",
                vnpAmount
        );
        parameters.put(
                "vnp_CurrCode",
                "VND"
        );
        parameters.put(
                "vnp_TxnRef",
                transactionReference
        );
        parameters.put(
                "vnp_OrderInfo",
                "Thanh toan don hang " + payment.getOrderId()
        );
        parameters.put(
                "vnp_OrderType",
                properties.orderType()
        );
        parameters.put(
                "vnp_Locale",
                properties.locale()
        );
        parameters.put(
                "vnp_ReturnUrl",
                properties.returnUrl()
        );
        parameters.put(
                "vnp_IpAddr",
                clientIp
        );
        parameters.put(
                "vnp_CreateDate",
                createdAt.format(VNPAY_DATE_FORMAT)
        );
        parameters.put(
                "vnp_ExpireDate",
                expireAt.format(VNPAY_DATE_FORMAT)
        );

        String queryString =
                VnPayUtils.buildQueryString(parameters);

        String secureHash = VnPayUtils.hmacSHA512(
                properties.hashSecret(),
                queryString
        );

        return properties.paymentUrl()
                + "?"
                + queryString
                + "&vnp_SecureHash="
                + secureHash;
    }

    @Override
    public boolean verifyCallback(
            Map<String, String> parameters
    ) {
        String receivedSecureHash =
                parameters.get("vnp_SecureHash");

        if (receivedSecureHash == null
                || receivedSecureHash.isBlank()) {
            return false;
        }

        Map<String, String> signedParameters =
                new TreeMap<>(parameters);

        signedParameters.remove("vnp_SecureHash");
        signedParameters.remove("vnp_SecureHashType");

        String signedData =
                VnPayUtils.buildQueryString(signedParameters);

        String calculatedSecureHash =
                VnPayUtils.hmacSHA512(
                        properties.hashSecret(),
                        signedData
                );

        return calculatedSecureHash.equalsIgnoreCase(
                receivedSecureHash
        );
    }

    private void validateConfiguration() {
        if (properties.tmnCode() == null
                || properties.tmnCode().isBlank()
                || "YOUR_TMN_CODE".equals(properties.tmnCode())) {
            throw new IllegalStateException(
                    "Chưa cấu hình VNPAY_TMN_CODE"
            );
        }

        if (properties.hashSecret() == null
                || properties.hashSecret().isBlank()
                || "YOUR_HASH_SECRET".equals(
                properties.hashSecret()
        )) {
            throw new IllegalStateException(
                    "Chưa cấu hình VNPAY_HASH_SECRET"
            );
        }
    }
}