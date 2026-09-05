export type RateLimitBucket = 'pollCreation' | 'ballotSubmission';

export interface RateLimitPolicy {
  limit: number;
  windowMs: number;
}

export type RateLimitPolicies = Record<RateLimitBucket, RateLimitPolicy>;

export interface RateLimitClock {
  now(): number;
}

export const RATE_LIMIT_POLICIES = Symbol('RATE_LIMIT_POLICIES');
export const RATE_LIMIT_CLOCK = Symbol('RATE_LIMIT_CLOCK');

const ONE_HOUR_MS = 60 * 60 * 1000;

export const DEFAULT_RATE_LIMIT_POLICIES: RateLimitPolicies = {
  pollCreation: { limit: 5, windowMs: ONE_HOUR_MS },
  ballotSubmission: { limit: 300, windowMs: ONE_HOUR_MS },
};
