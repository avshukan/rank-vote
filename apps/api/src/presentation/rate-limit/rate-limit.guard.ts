import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import type { RateLimitBucket } from './rate-limit.config';
import { RATE_LIMIT_BUCKET_METADATA } from './rate-limit.decorator';
import { RateLimitService } from './rate-limit.service';

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly rateLimitService: RateLimitService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const bucket = this.reflector.get<RateLimitBucket>(
      RATE_LIMIT_BUCKET_METADATA,
      context.getHandler(),
    );
    if (!bucket) return true;

    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    if (!request.ip)
      throw new Error('HTTP framework did not expose a client IP');

    const decision = this.rateLimitService.consume(bucket, request.ip);
    if (decision.allowed) return true;

    http
      .getResponse<Response>()
      .setHeader('Retry-After', String(decision.retryAfterSeconds));
    throw new HttpException(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        message: 'Too many requests',
        error: 'Too Many Requests',
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
