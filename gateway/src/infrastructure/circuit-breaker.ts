import { GatewayError } from "../errors";

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly resetMs: number,
  ) {}

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.openedAt > 0 && Date.now() - this.openedAt < this.resetMs) {
      throw new GatewayError("UPSTREAM_UNAVAILABLE", "NetEase is temporarily unavailable.", 503, Math.ceil(this.resetMs / 1_000));
    }
    if (this.openedAt > 0) {
      this.openedAt = 0;
      this.failures = 0;
    }
    try {
      const result = await operation();
      this.failures = 0;
      return result;
    } catch (error) {
      this.failures += 1;
      if (this.failures >= this.failureThreshold) this.openedAt = Date.now();
      throw error;
    }
  }
}
