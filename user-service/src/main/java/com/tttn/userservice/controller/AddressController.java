package com.tttn.userservice.controller;

import com.tttn.userservice.dto.request.AddressRequest;
import com.tttn.userservice.dto.response.AddressResponse;
import com.tttn.userservice.dto.response.ApiResponse;
import com.tttn.userservice.service.AddressService;
import com.tttn.userservice.util.AuthTokenResolver;
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
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/addresses")
@RequiredArgsConstructor
public class AddressController {

    private final AddressService addressService;
    private final AuthTokenResolver authTokenResolver;

    @GetMapping
    public ResponseEntity<ApiResponse<List<AddressResponse>>> listAddresses(
            @RequestHeader(
                    value = "Authorization",
                    required = false
            ) String authorizationHeader,
            @RequestParam(value = "page", defaultValue = "1") int page,
            @RequestParam(value = "limit", defaultValue = "20") int limit
    ) {
        UUID userId = authTokenResolver.resolveUserId(authorizationHeader);

        return ResponseEntity.ok(
                ApiResponse.page(
                        "Lấy danh sách địa chỉ thành công",
                        addressService.listAddresses(userId, page, limit)
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
        UUID userId = authTokenResolver.resolveUserId(authorizationHeader);

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
        UUID userId = authTokenResolver.resolveUserId(authorizationHeader);

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
        UUID userId = authTokenResolver.resolveUserId(authorizationHeader);

        addressService.deleteAddress(userId, id);

        return ResponseEntity.ok(
                ApiResponse.success(
                        "Xóa địa chỉ thành công",
                        null
                )
        );
    }
}
