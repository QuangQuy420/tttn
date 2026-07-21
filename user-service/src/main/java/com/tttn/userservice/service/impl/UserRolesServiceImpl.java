package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.response.UserResponse;
import com.tttn.userservice.entity.Role;
import com.tttn.userservice.entity.User;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.RoleRepository;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.UserRolesService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserRolesServiceImpl implements UserRolesService {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;

    @Override
    @Transactional
    public UserResponse assignRole(UUID userId, UUID roleId) {
        User user = findUser(userId);
        Role role = findRole(roleId);

        user.getRoles().add(role);
        user = userRepository.save(user);

        return toUserResponse(user);
    }

    @Override
    @Transactional
    public UserResponse removeRole(UUID userId, UUID roleId) {
        User user = findUser(userId);
        Role role = findRole(roleId);

        if (!user.getRoles().remove(role)) {
            throw new BusinessException(ErrorCode.USER_ROLE_NOT_ASSIGNED);
        }

        user = userRepository.save(user);

        return toUserResponse(user);
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    private Role findRole(UUID roleId) {
        return roleRepository.findById(roleId)
                .orElseThrow(() -> new BusinessException(ErrorCode.ROLE_NOT_FOUND));
    }

    private UserResponse toUserResponse(User user) {
        List<String> roleNames = user.getRoles()
                .stream()
                .map(Role::getName)
                .toList();

        return new UserResponse(
                user.getId(),
                user.getEmail(),
                user.getUsername(),
                roleNames,
                user.getStatus()
        );
    }
}
