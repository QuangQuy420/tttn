package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.response.ApiResponse;
import com.tttn.userservice.dto.response.UserResponse;
import com.tttn.userservice.entity.User;
import com.tttn.userservice.enums.UserStatus;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.exception.GlobalExceptionHandler;
import com.tttn.userservice.repository.ProfileRepository;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.PermissionService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class UserServiceListUsersTest {

    @Mock
    private UserRepository userRepository;

    @Mock
    private ProfileRepository profileRepository;

    @Mock
    private PermissionService permissionService;

    @Mock
    private PasswordEncoder passwordEncoder;

    @InjectMocks
    private UserServiceImpl userService;

    @Test
    void listUsers_mapsOneBasedPageAndReturnsDataWithMeta() {
        User user = User.builder()
                .email("a@example.com")
                .username("alice")
                .status(UserStatus.ACTIVE)
                .build();
        PageRequest expectedRequest = PageRequest.of(1, 1);
        when(userRepository.findAll(any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(user), expectedRequest, 3));

        ApiResponse<List<UserResponse>> response = ApiResponse.page(
                "ok",
                userService.listUsers(2, 1)
        );

        verify(userRepository).findAll(expectedRequest);
        assertThat(response.success()).isTrue();
        assertThat(response.data())
                .extracting(UserResponse::username)
                .containsExactly("alice");
        assertThat(response.meta().page()).isEqualTo(2);
        assertThat(response.meta().limit()).isEqualTo(1);
        assertThat(response.meta().total()).isEqualTo(3);
        assertThat(response.meta().totalPages()).isEqualTo(3);
        assertThat(response.error()).isNull();
    }

    @Test
    void listUsers_pageZero_returns400ValidationFailed() {
        assertThatThrownBy(() -> userService.listUsers(0, 20))
                .isInstanceOfSatisfying(BusinessException.class, exception -> {
                    assertThat(exception.getErrorCode())
                            .isEqualTo(ErrorCode.VALIDATION_FAILED);

                    ResponseEntity<ApiResponse<Void>> response =
                            new GlobalExceptionHandler()
                                    .handleBusinessException(exception);

                    assertThat(response.getStatusCode())
                            .isEqualTo(HttpStatus.BAD_REQUEST);
                    assertThat(response.getBody().success()).isFalse();
                    assertThat(response.getBody().error().code())
                            .isEqualTo("VALIDATION_FAILED");
                });

        verify(userRepository, never()).findAll(any(Pageable.class));
    }
}
