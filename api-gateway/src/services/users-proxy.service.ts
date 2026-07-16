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

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.baseUrl =
            this.configService.get<AppConfig>('app')!.userServiceUrl;
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

    private async forwardGet(
        path: string,
        authorization?: string,
    ): Promise<unknown> {
        try {
            const response = await firstValueFrom(
                this.httpService.get(`${this.baseUrl}${path}`, {
                    headers: this.buildHeaders(authorization),
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