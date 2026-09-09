import {
  DEFAULT_RATE_LIMIT_POLICIES,
  type RateLimitClock,
  type RateLimitPolicies,
} from './rate-limit.config';
import { RateLimitService } from './rate-limit.service';

class FakeClock implements RateLimitClock {
  constructor(public currentTime: number) {}

  now(): number {
    return this.currentTime;
  }
}

const policies: RateLimitPolicies = {
  pollCreation: { limit: 2, windowMs: 10_000 },
  ballotSubmission: { limit: 1, windowMs: 10_000 },
};

describe('RateLimitService', () => {
  it('uses the production limits and one-hour windows', () => {
    expect(DEFAULT_RATE_LIMIT_POLICIES).toEqual({
      pollCreation: { limit: 5, windowMs: 3_600_000 },
      ballotSubmission: { limit: 300, windowMs: 3_600_000 },
    });
  });

  it('allows the configured limit, rejects without extending, then resets', () => {
    const clock = new FakeClock(1_000);
    const limiter = new RateLimitService(policies, clock);

    expect(limiter.consume('pollCreation', 'client')).toEqual({
      allowed: true,
    });
    expect(limiter.consume('pollCreation', 'client')).toEqual({
      allowed: true,
    });

    clock.currentTime = 2_500;
    expect(limiter.consume('pollCreation', 'client')).toEqual({
      allowed: false,
      retryAfterSeconds: 9,
    });

    clock.currentTime = 11_000;
    expect(limiter.consume('pollCreation', 'client')).toEqual({
      allowed: true,
    });
  });

  it('keeps route buckets and client IPs independent', () => {
    const limiter = new RateLimitService(policies, new FakeClock(1_000));

    expect(limiter.consume('ballotSubmission', 'client-a')).toEqual({
      allowed: true,
    });
    expect(limiter.consume('ballotSubmission', 'client-a')).toEqual({
      allowed: false,
      retryAfterSeconds: 10,
    });
    expect(limiter.consume('pollCreation', 'client-a')).toEqual({
      allowed: true,
    });
    expect(limiter.consume('ballotSubmission', 'client-b')).toEqual({
      allowed: true,
    });
  });
});
