package com.tttn.userservice.service.impl;

import com.tttn.userservice.dto.response.PermissionListResponse;
import com.tttn.userservice.entity.Permission;
import com.tttn.userservice.entity.Role;
import com.tttn.userservice.entity.User;
import com.tttn.userservice.exception.BusinessException;
import com.tttn.userservice.exception.ErrorCode;
import com.tttn.userservice.repository.UserRepository;
import com.tttn.userservice.service.PermissionService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Set;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class PermissionServiceImpl implements PermissionService {

    private final UserRepository userRepository;

    @Override
    @Transactional(readOnly = true)
    public List<String> getPermissions(UUID userId) {
        return toPermissionCodes(findUser(userId));
    }

    @Override
    @Transactional(readOnly = true)
    public PermissionListResponse getAuthorizationState(UUID userId) {
        User user = findUser(userId);

        return new PermissionListResponse(
                toPermissionCodes(user),
                user.getStatus(),
                user.tokensValidAfterEpochSecond()
        );
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasPermission(UUID userId, String permissionCode) {
        return getPermissions(userId).contains(permissionCode);
    }

    private User findUser(UUID userId) {
        return userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));
    }

    private List<String> toPermissionCodes(User user) {
        return user.getRoles()
                .stream()
                .map(Role::getPermissions)
                .flatMap(Set::stream)
                .map(Permission::getCode)
                .distinct()
                .toList();
    }
}
