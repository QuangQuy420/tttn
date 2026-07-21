package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.request.ChangePasswordRequest;
import com.tttn.userservice.dto.request.UpdateProfileRequest;
import com.tttn.userservice.dto.response.PaginatedResponse;
import com.tttn.userservice.dto.response.ProfileResponse;
import com.tttn.userservice.dto.response.UserResponse;
import com.tttn.userservice.entity.Profile;
import com.tttn.userservice.entity.Role;
import com.tttn.userservice.entity.User;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.ProfileRepository;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.UserService;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserServiceImpl implements UserService {

    private final UserRepository userRepository;
    private final ProfileRepository profileRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    @Transactional(readOnly = true)
    public ProfileResponse getProfile(UUID userId) {
        User user = findUser(userId);
        Profile profile = findProfile(userId);

        return toProfileResponse(user, profile);
    }

    @Override
    @Transactional
    public ProfileResponse updateProfile(
            UUID userId,
            UpdateProfileRequest request
    ) {
        User user = findUser(userId);
        Profile profile = findProfile(userId);

        if (request.fullName() != null && !request.fullName().isBlank()) {
            profile.setFullName(
                    request.fullName()
                            .trim()
                            .replaceAll("\\s+", " ")
            );
        }

        if (request.phone() != null) {
            profile.setPhone(normalizeNullable(request.phone()));
        }

        if (request.avatarUrl() != null) {
            profile.setAvatarUrl(
                    normalizeNullable(request.avatarUrl())
            );
        }

        if (request.address() != null) {
            profile.setAddress(
                    normalizeNullable(request.address())
            );
        }

        if (request.dateOfBirth() != null) {
            profile.setDateOfBirth(request.dateOfBirth());
        }

        profileRepository.save(profile);

        return toProfileResponse(user, profile);
    }

    @Override
    @Transactional
    public void changePassword(
            UUID userId,
            ChangePasswordRequest request
    ) {
        User user = findUser(userId);

        if (!passwordEncoder.matches(
                request.currentPassword(),
                user.getPasswordHash()
        )) {
            throw new BusinessException(
                    ErrorCode.CURRENT_PASSWORD_INCORRECT
            );
        }

        if (passwordEncoder.matches(
                request.newPassword(),
                user.getPasswordHash()
        )) {
            throw new BusinessException(
                    ErrorCode.NEW_PASSWORD_SAME_AS_CURRENT
            );
        }

        user.setPasswordHash(
                passwordEncoder.encode(request.newPassword())
        );

        userRepository.save(user);
    }

    @Override
    @Transactional(readOnly = true)
    public PaginatedResponse<UserResponse> listUsers(int page, int limit) {
        Page<User> userPage = userRepository.findAll(
                PageRequest.of(page - 1, limit)
        );

        List<UserResponse> items = userPage.getContent()
                .stream()
                .map(this::toUserResponse)
                .toList();

        return new PaginatedResponse<>(
                items,
                userPage.getTotalElements(),
                page,
                limit,
                userPage.getTotalPages()
        );
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.USER_NOT_FOUND)
                );
    }

    private Profile findProfile(UUID userId) {
        return profileRepository.findByUserId(userId)
                .orElseThrow(() ->
                        new BusinessException(ErrorCode.PROFILE_NOT_FOUND)
                );
    }

    private ProfileResponse toProfileResponse(
            User user,
            Profile profile
    ) {
        return new ProfileResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                toRoleNames(user),
                user.getStatus(),
                profile.getFullName(),
                profile.getPhone(),
                profile.getAvatarUrl(),
                profile.getAddress(),
                profile.getDateOfBirth()
        );
    }

    private UserResponse toUserResponse(User user) {
        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                toRoleNames(user),
                user.getStatus()
        );
    }

    private List<String> toRoleNames(User user) {
        return user.getRoles()
                .stream()
                .map(Role::getName)
                .toList();
    }

    private String normalizeNullable(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        return value.trim();
    }
}