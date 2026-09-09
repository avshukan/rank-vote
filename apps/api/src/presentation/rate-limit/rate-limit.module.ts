import { Module } from '@nestjs/common';
import {
  DEFAULT_RATE_LIMIT_POLICIES,
  RATE_LIMIT_CLOCK,
  RATE_LIMIT_POLICIES,
} from './rate-limit.config';
import { RateLimitGuard } from './rate-limit.guard';
import { RateLimitService } from './rate-limit.service';

@Module({
  providers: [
    RateLimitGuard,
    RateLimitService,
    { provide: RATE_LIMIT_POLICIES, useValue: DEFAULT_RATE_LIMIT_POLICIES },
    { provide: RATE_LIMIT_CLOCK, useValue: { now: () => Date.now() } },
  ],
  exports: [RateLimitGuard, RateLimitService],
})
export class RateLimitModule {}
