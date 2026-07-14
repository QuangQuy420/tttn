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
export class AuthProxyService {
    private readonly logger = new Logger(AuthProxyService.name);
    private readonly baseUrl: string;

    constructor(
        private readonly httpService: HttpService,
        private readonly configService: ConfigService,
    ) {
        this.baseUrl =
            this.configService.get<AppConfig>('app')!.userServiceUrl;
    }

    register(body: Record<string, unknown>): Promise<unknown> {
        return this.forwardPost('/api/v1/auth/register', body);
    }

    login(body: Record<string, unknown>): Promise<unknown> {
        return this.forwardPost('/api/v1/auth/login', body);
    }

    forgotPassword(body: Record<string, unknown>): Promise<unknown> {
        return this.forwardPost('/api/v1/auth/forgot-password', body);
    }

    resetPassword(body: Record<string, unknown>): Promise<unknown> {
        return this.forwardPost('/api/v1/auth/reset-password', body);
    }

    private async forwardPost(
        path: string,
        body: Record<string, unknown>,
    ): Promise<unknown> {
        try {
            const response = await firstValueFrom(
                this.httpService.post(`${this.baseUrl}${path}`, body),
            );

            return response.data;
        } catch (error) {
            throw this.toGatewayError(error as AxiosError, path);
        }
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
                'user-service did not respond in time',
                HttpStatus.GATEWAY_TIMEOUT,
            );
        }

        this.logger.error(
            `user-service unreachable on ${path}: ${error.message}`,
        );

        return new HttpException(
            'user-service is unreachable',
            HttpStatus.SERVICE_UNAVAILABLE,
        );
    }
}