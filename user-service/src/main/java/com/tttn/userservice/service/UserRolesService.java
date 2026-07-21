package com.tttn.userservice.service;

import com.tttn.userservice.dto.response.UserResponse;

import java.util.UUID;

public interface UserRolesService {

    UserResponse assignRole(UUID userId, UUID roleId);

    UserResponse removeRole(UUID userId, UUID roleId);
}
