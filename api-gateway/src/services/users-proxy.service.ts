import { HttpService } from '@nestjs/axios';
import {
    HttpException,
    HttpStatus,
    Injectable,
    Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { AppConfig } from '../config/configuration';

/** Timeout of the internal permissions call (shorter than the shared one). */
const PERMISSIONS_TIMEOUT_MS = 1500;

/** Live auth data of one user, as returned by user-service's internal endpoint. */
export interface UserAuthState {
    permissions: string[];
    /** `ACTIVE` | `INACTIVE` | `LOCKED`; `null` when user-service does not send it. */
    status: string | null;
    /** Epoch seconds; a JWT with `iat` before it is revoked. `null` = no cut-off. */
    tokensValidAfter: number | null;
}

@Injectable()
export class UsersProxyService {
    private readonly logger = new Logger(UsersProxyService.name);
    private readonly baseUrl: string;
    private readonly internalApiKey: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.baseUrl =
            this.configService.get<AppConfig>('app')!.userServiceUrl;
        this.internalApiKey =
            this.configService.get<AppConfig>('app')!.internalApiKey;
    }

    getProfile(authorization?: string): Promise<unknown> {
        return this.forwardGet('/api/v1/users/me', authorization);
    }

    updateProfile(
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardPut(
            '/api/v1/users/me',
            body,
            authorization,
        );
    }

    changePassword(
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardPut(
            '/api/v1/users/change-password',
            body,
            authorization,
        );
    }

    listAddresses(
        query: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardGet('/api/v1/addresses', authorization, query);
    }

    createAddress(
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardPost('/api/v1/addresses', body, authorization);
    }

    updateAddress(
        id: string,
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardPut(`/api/v1/addresses/${encodeURIComponent(id)}`, body, authorization);
    }

    deleteAddress(id: string, authorization?: string): Promise<unknown> {
        return this.forwardDelete(`/api/v1/addresses/${encodeURIComponent(id)}`, authorization);
    }

    listRoles(
        query: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardGet('/api/v1/roles', authorization, query);
    }

    listUsers(
        query: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardGet('/api/v1/users', authorization, query);
    }

    createRole(
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardPost('/api/v1/roles', body, authorization);
    }

    updateRole(
        id: string,
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardPut(`/api/v1/roles/${encodeURIComponent(id)}`, body, authorization);
    }

    deleteRole(id: string, authorization?: string): Promise<unknown> {
        return this.forwardDelete(`/api/v1/roles/${encodeURIComponent(id)}`, authorization);
    }

    listPermissions(
        query: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardGet('/api/v1/permissions', authorization, query);
    }

    assignRoleToUser(
        userId: string,
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardPost(
            `/api/v1/users/${encodeURIComponent(userId)}/roles`,
            body,
            authorization,
        );
    }

    removeRoleFromUser(
        userId: string,
        roleId: string,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardDelete(
            `/api/v1/users/${encodeURIComponent(userId)}/roles/${encodeURIComponent(roleId)}`,
            authorization,
        );
    }

    /**
     * Internal, service-to-service call — not exposed to end users. Asks
     * user-service for the caller's *current* flattened permission code
     * list (no JWT-embedded snapshot), account status and token cut-off
     * (`tokensValidAfter`, epoch seconds). Called through
     * `PermissionsCacheService`, which caches the result for ≤ 60 s and
     * drops it on gateway role changes. Requires `X-Internal-Key` (T11's gate on
     * user-service's `/internal/**` routes). An older user-service without
     * `status` / `tokensValidAfter` yields `null` for both (= token valid).
     * Uses its own short timeout: it sits in front of every JWT route, so a
     * hung user-service must not hold each request for the full downstream
     * timeout.
     */
    async getPermissions(userId: string): Promise<UserAuthState> {
        const path = `/internal/v1/users/${encodeURIComponent(userId)}/permissions`;
        try {
            const response = await firstValueFrom(
                this.httpService.get<{
                    data: {
                        permissions: string[];
                        status?: string | null;
                        tokensValidAfter?: number | null;
                    };
                }>(
                    `${this.baseUrl}${path}`,
                    {
                        headers: { 'X-Internal-Key': this.internalApiKey },
                        timeout: PERMISSIONS_TIMEOUT_MS,
                    },
                ),
            );

            const data = response.data.data;
            return {
                permissions: data.permissions,
                status: data.status ?? null,
                tokensValidAfter: data.tokensValidAfter ?? null,
            };
        } catch (error) {
            throw this.toGatewayError(error as AxiosError, path);
        }
    }

    private async forwardGet(
        path: string,
        authorization?: string,
        params?: Record<string, unknown>,
    ): Promise<unknown> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}${path}`, {
                    headers: this.buildHeaders(authorization),
                    params,
                }),
            );

            return response.data;
        } catch (error) {
            throw this.toGatewayError(error as AxiosError, path);
        }
    }

    private async forwardPut(
        path: string,
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        try {
            const response = await firstValueFrom(
                this.httpService.put(`${this.baseUrl}${path}`, body, {
                    headers: this.buildHeaders(authorization),
                }),
            );

            return response.data;
        } catch (error) {
            throw this.toGatewayError(error as AxiosError, path);
        }
    }

    private async forwardPost(
        path: string,
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        try {
            const response = await firstValueFrom(
                this.httpService.post(`${this.baseUrl}${path}`, body, {
                    headers: this.buildHeaders(authorization),
                }),
            );

            return response.data;
        } catch (error) {
            throw this.toGatewayError(error as AxiosError, path);
        }
    }

    private async forwardDelete(
        path: string,
        authorization?: string,
    ): Promise<unknown> {
        try {
            const response = await firstValueFrom(
                this.httpService.delete(`${this.baseUrl}${path}`, {
                    headers: this.buildHeaders(authorization),
                }),
            );

            return response.data;
        } catch (error) {
            throw this.toGatewayError(error as AxiosError, path);
        }
    }

    private buildHeaders(
        authorization?: string,
    ): Record<string, string> {
        return authorization
            ? { Authorization: authorization }
            : {};
    }

    private toGatewayError(
        error: AxiosError,
        path: string,
    ): HttpException {
        if (error.response) {
            return new HttpException(
                error.response.data ?? error.message,
                error.response.status,
            );
        }

        if (
            error.code === 'ECONNABORTED' ||
            error.code === 'ETIMEDOUT'
        ) {
            this.logger.error(
                `user-service timed out on ${path}: ${error.message}`,
            );

            return new HttpException(
                'user-service không phản hồi kịp thời',
                HttpStatus.GATEWAY_TIMEOUT,
            );
        }

        this.logger.error(
            `user-service unreachable on ${path}: ${error.message}`,
        );

        return new HttpException(
            'Không thể kết nối tới user-service',
            HttpStatus.SERVICE_UNAVAILABLE,
        );
    }
}