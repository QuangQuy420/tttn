package com.tttn.userservice.service.impl;

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
        User user = userRepository.findById(userId)
                .orElseThrow(() -> new BusinessException(ErrorCode.USER_NOT_FOUND));

        return user.getRoles()
                .stream()
                .map(Role::getPermissions)
                .flatMap(Set::stream)
                .map(Permission::getCode)
                .distinct()
                .toList();
    }

    @Override
    @Transactional(readOnly = true)
    public boolean hasPermission(UUID userId, String permissionCode) {
        return getPermissions(userId).contains(permissionCode);
    }
}
