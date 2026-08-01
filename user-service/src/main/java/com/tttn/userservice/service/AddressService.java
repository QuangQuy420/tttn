package com.tttn.userservice.service;

import com.tttn.userservice.dto.request.AddressRequest;
import com.tttn.userservice.dto.response.AddressResponse;

import java.util.List;
import java.util.UUID;

public interface AddressService {

    List<AddressResponse> listAddresses(UUID userId);

    AddressResponse createAddress(UUID userId, AddressRequest request);

    AddressResponse updateAddress(UUID userId, UUID addressId, AddressRequest request);

    void deleteAddress(UUID userId, UUID addressId);
}
