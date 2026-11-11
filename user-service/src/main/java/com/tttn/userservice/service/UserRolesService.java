package com.tttn.userservice.service;

import com.tttn.userservice.dto.response.UserResponse;

import java.util.UUID;

public interface UserRolesService {

    // callingUserId must hold every permission of the role (no self-escalation through assignment).
    UserResponse assignRole(UUID callingUserId, UUID userId, UUID roleId);

    UserResponse removeRole(UUID userId, UUID roleId);
}
