export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>();

  check(key: string, limit: number, windowMs = 60_000): { allowed: boolean; retryAfterSeconds: number } {
    const now = Date.now();
    const cutoff = now - windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil(((recent[0] ?? now) + windowMs - now) / 1_000));
      this.hits.set(key, recent);
      return { allowed: false, retryAfterSeconds };
    }
    recent.push(now);
    this.hits.set(key, recent);
    if (this.hits.size > 10_000) this.cleanup(cutoff);
    return { allowed: true, retryAfterSeconds: 0 };
  }

  private cleanup(cutoff: number): void {
    for (const [key, timestamps] of this.hits) {
      const recent = timestamps.filter((timestamp) => timestamp > cutoff);
      if (recent.length === 0) this.hits.delete(key);
      else this.hits.set(key, recent);
    }
  }
}
