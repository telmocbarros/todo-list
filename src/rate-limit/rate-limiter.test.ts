import { describe, expect, it } from 'vitest';
import { SlidingWindowRateLimiter } from './rate-limiter.js';

describe('SlidingWindowRateLimiter', () => {
  // 3 hits per 15 time units, with a clock the test controls
  const setup = () => {
    let now = 0;
    const limiter = new SlidingWindowRateLimiter({ max: 3, windowMs: 15, now: () => now });
    return { limiter, at: (time: number) => (now = time) };
  };

  it('allows up to the limit within the window, then rejects with the wait until a slot frees up', () => {
    const { limiter, at } = setup();
    at(0);
    expect(limiter.hit('ip').allowed).toBe(true);
    at(5);
    expect(limiter.hit('ip').allowed).toBe(true);
    at(10);
    expect(limiter.hit('ip').allowed).toBe(true);
    at(12);
    // The oldest hit (at 0) leaves the window at 15, so the wait is 3
    expect(limiter.hit('ip')).toEqual({ allowed: false, retryAfterMs: 3 });
  });

  it('slides: a slot frees up exactly when the oldest hit leaves the window, not at a clock boundary', () => {
    const { limiter, at } = setup();
    for (const time of [0, 5, 10]) {
      at(time);
      limiter.hit('ip');
    }
    at(14);
    expect(limiter.hit('ip').allowed).toBe(false);
    at(15); // the hit at 0 has left the window; the ones at 5 and 10 are still in it
    expect(limiter.hit('ip').allowed).toBe(true);
    at(16);
    expect(limiter.hit('ip').allowed).toBe(false);
  });

  it('does not count rejected hits, so hammering does not extend the block', () => {
    const { limiter, at } = setup();
    for (const time of [0, 1, 2]) {
      at(time);
      limiter.hit('ip');
    }
    for (const time of [3, 4, 5, 6, 7]) {
      at(time);
      expect(limiter.hit('ip').allowed).toBe(false);
    }
    at(15);
    expect(limiter.hit('ip').allowed).toBe(true);
  });

  it('tracks each key separately', () => {
    const { limiter, at } = setup();
    at(0);
    for (let i = 0; i < 3; i++) limiter.hit('a');
    expect(limiter.hit('a').allowed).toBe(false);
    expect(limiter.hit('b').allowed).toBe(true);
  });

  it('forgets keys whose hits have all left the window when swept, so memory does not grow forever', () => {
    const { limiter, at } = setup();
    at(0);
    limiter.hit('old');
    at(10);
    limiter.hit('recent');
    expect(limiter.size).toBe(2);
    at(20); // "old" left the window at 15; "recent" stays until 25
    limiter.sweep();
    expect(limiter.size).toBe(1);
  });
});
