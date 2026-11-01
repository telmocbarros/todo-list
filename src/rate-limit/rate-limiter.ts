export interface IRateLimitResult {
  allowed: boolean;
  /** How long until the next hit would be allowed; 0 when this hit was allowed. */
  retryAfterMs: number;
}

export interface IRateLimiter {
  hit(key: string): IRateLimitResult;
}

export interface ISlidingWindowOptions {
  max: number;
  windowMs: number;
  now?: () => number;
}

/**
 * Sliding window log: remembers when each recent hit happened, per key, and allows at most `max`
 * hits in any rolling `windowMs`. Unlike a fixed window there is no clock boundary to exploit, and
 * memory is bounded at `max` timestamps per key, since rejected hits are not recorded.
 *
 * State is in memory, which is right for a single instance (SQLite already requires one).
 * Several instances would need a shared store such as Redis.
 */
export class SlidingWindowRateLimiter implements IRateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly max: number;
  private readonly windowMs: number;
  private readonly now: () => number;

  constructor({ max, windowMs, now = Date.now }: ISlidingWindowOptions) {
    this.max = max;
    this.windowMs = windowMs;
    this.now = now;
  }

  hit(key: string): IRateLimitResult {
    const now = this.now();
    const recent = this.recentHits(key, now);

    if (recent.length >= this.max) {
      // The oldest hit is the next to leave the window and free a slot
      return { allowed: false, retryAfterMs: recent[0]! + this.windowMs - now };
    }

    recent.push(now);
    this.hits.set(key, recent);
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Drops keys with no hits left in the window. Call periodically; otherwise every IP ever seen is kept. */
  sweep(): void {
    const now = this.now();
    for (const key of this.hits.keys()) {
      if (this.recentHits(key, now).length === 0) this.hits.delete(key);
    }
  }

  /** Number of keys currently tracked. */
  get size(): number {
    return this.hits.size;
  }

  private recentHits(key: string, now: number): number[] {
    const recent = (this.hits.get(key) ?? []).filter((time) => time > now - this.windowMs);
    this.hits.set(key, recent);
    return recent;
  }
}
