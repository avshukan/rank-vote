import { Inject, Injectable } from '@nestjs/common';
import {
  RATE_LIMIT_CLOCK,
  RATE_LIMIT_POLICIES,
  type RateLimitBucket,
  type RateLimitClock,
  type RateLimitPolicies,
} from './rate-limit.config';

interface FixedWindow {
  count: number;
  expiresAt: number;
}

export type RateLimitDecision =
  | { allowed: true }
  | { allowed: false; retryAfterSeconds: number };

@Injectable()
export class RateLimitService {
  private readonly windows = new Map<
    RateLimitBucket,
    Map<string, FixedWindow>
  >();

  constructor(
    @Inject(RATE_LIMIT_POLICIES)
    private readonly policies: RateLimitPolicies,
    @Inject(RATE_LIMIT_CLOCK) private readonly clock: RateLimitClock,
  ) {}

  consume(bucket: RateLimitBucket, clientIp: string): RateLimitDecision {
    const now = this.clock.now();
    const policy = this.policies[bucket];
    const bucketWindows = this.getBucketWindows(bucket);

    this.removeExpiredWindows(bucketWindows, now);

    const window = bucketWindows.get(clientIp);
    if (!window) {
      bucketWindows.set(clientIp, {
        count: 1,
        expiresAt: now + policy.windowMs,
      });
      return { allowed: true };
    }

    if (window.count < policy.limit) {
      window.count += 1;
      return { allowed: true };
    }

    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((window.expiresAt - now) / 1000),
    };
  }

  private getBucketWindows(bucket: RateLimitBucket): Map<string, FixedWindow> {
    const existing = this.windows.get(bucket);
    if (existing) return existing;

    const created = new Map<string, FixedWindow>();
    this.windows.set(bucket, created);
    return created;
  }

  private removeExpiredWindows(
    windows: Map<string, FixedWindow>,
    now: number,
  ): void {
    for (const [clientIp, window] of windows) {
      if (window.expiresAt <= now) windows.delete(clientIp);
    }
  }
}
