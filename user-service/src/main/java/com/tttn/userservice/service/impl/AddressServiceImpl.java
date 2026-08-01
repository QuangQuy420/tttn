package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.request.AddressRequest;
import com.tttn.userservice.dto.response.AddressResponse;
import com.tttn.userservice.entity.Address;
import com.tttn.userservice.entity.User;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.AddressRepository;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.AddressService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AddressServiceImpl implements AddressService {

    private final AddressRepository addressRepository;
    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public List<AddressResponse> listAddresses(UUID userId) {
        return addressRepository.findByUserIdOrderByDefaultAddressDescCreatedAtDesc(userId)
                .stream()
                .map(this::toResponse)
                .toList();
    }

    @Override
    @Transactional
    public AddressResponse createAddress(
            UUID userId,
            AddressRequest request
    ) {
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        // The very first address a user saves always becomes their default, regardless of
        // what the request asked for, so there's never a saved-address list with no default.
        boolean makeDefault = request.isDefault() || !addressRepository.existsByUserId(userId);

        if (makeDefault) {
            addressRepository.clearDefaultForUser(userId);
        }

        Address address = Address.builder()
                .user(user)
                .receiverName(normalize(request.receiverName()))
                .receiverPhone(request.receiverPhone().trim())
                .address(normalize(request.address()))
                .defaultAddress(makeDefault)
                .build();

        // saveAndFlush, not save: @CreationTimestamp is only populated by Hibernate when the
        // insert actually flushes, and toResponse() below reads that field off the same
        // in-memory instance right after — a plain save() can leave createdAt null in the
        // response even though the row itself is inserted correctly moments later.
        addressRepository.saveAndFlush(address);

        return toResponse(address);
    }

    @Override
    @Transactional
    public AddressResponse updateAddress(
            UUID userId,
            UUID addressId,
            AddressRequest request
    ) {
        Address address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ADDRESS_NOT_FOUND));

        // Once an address is the default, editing it can't silently leave the user with none —
        // becoming non-default only happens by setting a *different* address as default instead.
        boolean makeDefault = request.isDefault() || address.isDefaultAddress();

        if (makeDefault) {
            addressRepository.clearDefaultForUser(userId);
        }

        address.setReceiverName(normalize(request.receiverName()));
        address.setReceiverPhone(request.receiverPhone().trim());
        address.setAddress(normalize(request.address()));
        address.setDefaultAddress(makeDefault);

        addressRepository.saveAndFlush(address);

        return toResponse(address);
    }

    @Override
    @Transactional
    public void deleteAddress(
            UUID userId,
            UUID addressId
    ) {
        Address address = addressRepository.findByIdAndUserId(addressId, userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ADDRESS_NOT_FOUND));

        addressRepository.delete(address);

        if (address.isDefaultAddress()) {
            // Promote the next-most-recent address to default so the user still has exactly
            // one default left, instead of silently ending up with none.
            addressRepository.findByUserIdOrderByDefaultAddressDescCreatedAtDesc(userId)
                    .stream()
                    .findFirst()
                    .ifPresent(next -> {
                        next.setDefaultAddress(true);
                        addressRepository.save(next);
                    });
        }
    }

    private String normalize(String value) {
        return value.trim().replaceAll("\\s+", " ");
    }

    private AddressResponse toResponse(Address address) {
        return new AddressResponse(
                address.getId(),
                address.getReceiverName(),
                address.getReceiverPhone(),
                address.getAddress(),
                address.isDefaultAddress(),
                address.getCreatedAt()
        );
    }
}
