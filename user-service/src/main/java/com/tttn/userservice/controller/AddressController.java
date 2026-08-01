package com.tttn.userservice.controller;

import com.tttn.userservice.dto.request.AddressRequest;
import com.tttn.userservice.dto.response.AddressResponse;
import com.tttn.userservice.dto.response.ApiResponse;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.service.AddressService;
import com.tttn.userservice.util.JwtUtil;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/addresses")
@RequiredArgsConstructor
public class AddressController {

    private final AddressService addressService;
    private final JwtUtil jwtUtil;

    @GetMapping
    public ResponseEntity<ApiResponse<List<AddressResponse>>> listAddresses(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader
    ) {
        UUID userId = extractUserId(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Lấy danh sách địa chỉ thành công",
                        addressService.listAddresses(userId)
                )
        );
    }

    @PostMapping
    public ResponseEntity<ApiResponse<AddressResponse>> createAddress(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @Valid @RequestBody AddressRequest request
    ) {
        UUID userId = extractUserId(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Thêm địa chỉ thành công",
                        addressService.createAddress(userId, request)
                )
        );
    }

    @PutMapping("/{id}")
    public ResponseEntity<ApiResponse<AddressResponse>> updateAddress(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @PathVariable UUID id,
            @Valid @RequestBody AddressRequest request
    ) {
        UUID userId = extractUserId(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Cập nhật địa chỉ thành công",
                        addressService.updateAddress(userId, id, request)
                )
        );
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<ApiResponse<Void>> deleteAddress(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @PathVariable UUID id
    ) {
        UUID userId = extractUserId(authorizationHeader);

        addressService.deleteAddress(userId, id);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Xóa địa chỉ thành công",
                        null
                )
        );
    }

    private UUID extractUserId(String authorizationHeader) {
        if (authorizationHeader == null
                || !authorizationHeader.startsWith("Bearer ")) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        String token = authorizationHeader.substring(7);

        if (!jwtUtil.validateToken(token)) {
            throw new BusinessException(ErrorCode.INVALID_TOKEN);
        }

        return jwtUtil.extractUserId(token);
    }
}
