package com.tttn.userservice.service;

import com.tttn.userservice.dto.request.AddressRequest;
import com.tttn.userservice.dto.response.AddressResponse;
import org.springframework.data.domain.Page;

import java.util.UUID;

public interface AddressService {

    Page<AddressResponse> listAddresses(UUID userId, int page, int limit);

    AddressResponse createAddress(UUID userId, AddressRequest request);

    AddressResponse updateAddress(UUID userId, UUID addressId, AddressRequest request);

    void deleteAddress(UUID userId, UUID addressId);
}
