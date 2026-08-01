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

    listAddresses(authorization?: string): Promise<unknown> {
        return this.forwardGet('/api/v1/addresses', authorization);
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
        return this.forwardPut(`/api/v1/addresses/${id}`, body, authorization);
    }

    deleteAddress(id: string, authorization?: string): Promise<unknown> {
        return this.forwardDelete(`/api/v1/addresses/${id}`, authorization);
    }

    listRoles(authorization?: string): Promise<unknown> {
        return this.forwardGet('/api/v1/roles', authorization);
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
        return this.forwardPut(`/api/v1/roles/${id}`, body, authorization);
    }

    deleteRole(id: string, authorization?: string): Promise<unknown> {
        return this.forwardDelete(`/api/v1/roles/${id}`, authorization);
    }

    listPermissions(authorization?: string): Promise<unknown> {
        return this.forwardGet('/api/v1/permissions', authorization);
    }

    assignRoleToUser(
        userId: string,
        body: Record<string, unknown>,
        authorization?: string,
    ): Promise<unknown> {
        return this.forwardPost(
            `/api/v1/users/${userId}/roles`,
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
            `/api/v1/users/${userId}/roles/${roleId}`,
            authorization,
        );
    }

    /**
     * Internal, service-to-service call — not exposed to end users. Asks
     * user-service for the caller's *current* flattened permission code
     * list, fresh on every call (no JWT-embedded snapshot), so role changes
     * apply immediately. Requires `X-Internal-Key` (T11's gate on
     * user-service's `/internal/**` routes).
     */
    async getPermissions(userId: string): Promise<string[]> {
        const path = `/internal/v1/users/${userId}/permissions`;
        try {
            const response = await firstValueFrom(
                this.httpService.get<{ data: { permissions: string[] } }>(
                    `${this.baseUrl}${path}`,
                    { headers: { 'X-Internal-Key': this.internalApiKey } },
                ),
            );

            return response.data.data.permissions;
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