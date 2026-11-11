package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.request.AddressRequest;
import com.tttn.userservice.dto.response.AddressResponse;
import com.tttn.userservice.entity.Address;
import com.tttn.userservice.repository.AddressRepository;
import com.tttn.userservice.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.jpa.repository.Modifying;

import java.time.LocalDateTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AddressServiceUpdateAddressTest {

    @Mock
    private AddressRepository addressRepository;

    @Mock
    private UserRepository userRepository;

    private AddressServiceImpl addressService;

    @BeforeEach
    void setUp() {
        addressService = new AddressServiceImpl(addressRepository, userRepository);
    }

    @Test
    void updateAddress_noChangeOnDefault_staysDefaultAndReturnsSavedEntity_AC12() {
        UUID userId = UUID.randomUUID();
        UUID addressId = UUID.randomUUID();
        Address loaded = address(addressId, true, null);
        // What saveAndFlush hands back after merging the detached instance.
        LocalDateTime createdAt = LocalDateTime.of(2026, 1, 1, 8, 0);
        Address merged = address(addressId, true, createdAt);
        when(addressRepository.findByIdAndUserId(addressId, userId))
                .thenReturn(Optional.of(loaded));
        when(addressRepository.saveAndFlush(any(Address.class))).thenReturn(merged);

        AddressResponse response = addressService.updateAddress(
                userId,
                addressId,
                new AddressRequest("Nguyen Van A", "0901234567", "1 Le Loi", false)
        );

        verify(addressRepository).clearDefaultForUser(userId);
        ArgumentCaptor<Address> saved = ArgumentCaptor.forClass(Address.class);
        verify(addressRepository).saveAndFlush(saved.capture());
        assertThat(saved.getValue().isDefaultAddress()).isTrue();
        assertThat(response.isDefault()).isTrue();
        assertThat(response.createdAt()).isEqualTo(createdAt);
    }

    @Test
    void clearDefaultForUser_clearsAndFlushesPersistenceContext_AC12() throws Exception {
        // Without clearAutomatically the still-managed address keeps defaultAddress=true in
        // memory, so re-setting true is "no change" and the DB row stays false.
        Modifying modifying = AddressRepository.class
                .getMethod("clearDefaultForUser", UUID.class)
                .getAnnotation(Modifying.class);

        assertThat(modifying).isNotNull();
        assertThat(modifying.clearAutomatically()).isTrue();
        assertThat(modifying.flushAutomatically()).isTrue();
    }

    private static Address address(UUID id, boolean isDefault, LocalDateTime createdAt) {
        Address address = Address.builder()
                .receiverName("Nguyen Van A")
                .receiverPhone("0901234567")
                .address("1 Le Loi")
                .defaultAddress(isDefault)
                .build();
        address.setId(id);
        address.setCreatedAt(createdAt);
        return address;
    }
}
