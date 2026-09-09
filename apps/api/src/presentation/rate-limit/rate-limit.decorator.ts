import { SetMetadata } from '@nestjs/common';
import type { RateLimitBucket } from './rate-limit.config';

export const RATE_LIMIT_BUCKET_METADATA = 'rateLimitBucket';

export const RateLimit = (bucket: RateLimitBucket): MethodDecorator =>
  SetMetadata(RATE_LIMIT_BUCKET_METADATA, bucket);
