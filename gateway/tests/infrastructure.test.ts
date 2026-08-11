import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GatewayError } from "../src/errors";
import { CircuitBreaker } from "../src/infrastructure/circuit-breaker";
import { RequestCoalescer } from "../src/infrastructure/coalescer";
import { SlidingWindowRateLimiter } from "../src/infrastructure/rate-limiter";
import { withTimeout } from "../src/infrastructure/timeout";
import { TtlCache } from "../src/infrastructure/ttl-cache";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-08-10T00:00:00Z"));
});

afterEach(() => vi.useRealTimers());

describe("gateway infrastructure", () => {
  it("expires cache entries and evicts the least recently used key", () => {
    const cache = new TtlCache<number>(2);
    cache.set("a", 1, 1_000);
    cache.set("b", 2, 1_000);
    expect(cache.get("a")).toBe(1);
    cache.set("c", 3, 1_000);

    expect(cache.get("b")).toBeUndefined();
    expect(cache.get("a")).toBe(1);
    vi.advanceTimersByTime(1_001);
    expect(cache.get("a")).toBeUndefined();
    expect(cache.get("c")).toBeUndefined();
  });

  it("enforces a sliding rate window and reports a bounded retry delay", () => {
    const limiter = new SlidingWindowRateLimiter();
    expect(limiter.check("song", 2, 5_000).allowed).toBe(true);
    expect(limiter.check("song", 2, 5_000).allowed).toBe(true);
    expect(limiter.check("song", 2, 5_000)).toEqual({ allowed: false, retryAfterSeconds: 5 });

    vi.advanceTimersByTime(5_001);
    expect(limiter.check("song", 2, 5_000)).toEqual({ allowed: true, retryAfterSeconds: 0 });
  });

  it("opens after consecutive upstream failures and recovers after the reset interval", async () => {
    const breaker = new CircuitBreaker(2, 10_000);
    const failure = new GatewayError("UPSTREAM_UNAVAILABLE", "down", 503);
    await expect(breaker.run(() => Promise.reject(failure))).rejects.toBe(failure);
    await expect(breaker.run(() => Promise.reject(failure))).rejects.toBe(failure);
    const blockedOperation = vi.fn().mockResolvedValue("not called");

    await expect(breaker.run(blockedOperation)).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE", status: 503 });
    expect(blockedOperation).not.toHaveBeenCalled();

    vi.advanceTimersByTime(10_001);
    await expect(breaker.run(() => Promise.resolve("recovered"))).resolves.toBe("recovered");
  });

  it("coalesces concurrent requests and removes the entry after settlement", async () => {
    const coalescer = new RequestCoalescer();
    let resolve!: (value: string) => void;
    const pending = new Promise<string>((done) => { resolve = done; });
    const operation = vi.fn(() => pending);
    const first = coalescer.run("track", operation);
    const second = coalescer.run("track", operation);
    expect(operation).toHaveBeenCalledTimes(1);

    resolve("done");
    await expect(Promise.all([first, second])).resolves.toEqual(["done", "done"]);
    await expect(coalescer.run("track", () => Promise.resolve("next"))).resolves.toBe("next");
  });

  it("maps a slow operation to the public timeout error", async () => {
    const result = withTimeout(new Promise<string>(() => undefined), 2_000, "slow upstream");
    const assertion = expect(result).rejects.toMatchObject({ code: "TIMEOUT", status: 504, message: "slow upstream" });
    await vi.advanceTimersByTimeAsync(2_001);
    await assertion;
  });
});
