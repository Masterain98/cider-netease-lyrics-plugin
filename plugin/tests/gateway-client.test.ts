import type { TrackQuery } from "@cider-netease/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LyricsGatewayClient } from "../src/api/lyrics-gateway-client";
import { PluginError } from "../src/domain/errors";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const track: TrackQuery = { title: "Song", artist: "Artist", album: "Album", durationMs: 120_000 };

describe("lyrics gateway client", () => {
  it("normalizes the base URL and parses a healthy response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "ok", schemaVersion: 1 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new LyricsGatewayClient(() => "http://127.0.0.1:3100/", () => 7_000);

    await expect(client.health()).resolves.toEqual({ status: "ok", schemaVersion: 1 });
    expect(fetchMock).toHaveBeenCalledWith("http://127.0.0.1:3100/health", expect.objectContaining({ method: "GET" }));
  });

  it("rejects embedded credentials before performing a network request", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const client = new LyricsGatewayClient(() => "https://user:secret@example.test", () => 7_000);

    await expect(client.health()).rejects.toMatchObject({ code: "GATEWAY_NOT_CONFIGURED" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("maps rate-limit responses without exposing arbitrary response data", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      error: { code: "RATE_LIMITED", message: "Try later", retryAfterSeconds: 12, ignored: "private" },
    }), { status: 429, headers: { "content-type": "application/json" } })));
    const client = new LyricsGatewayClient(() => "https://gateway.example", () => 7_000);

    const error = await client.health().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PluginError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", message: "Try later", retryAfterSeconds: 12 });
  });

  it("aborts a slow request at the configured timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    })));
    const client = new LyricsGatewayClient(() => "https://gateway.example", () => 1_000);
    const result = client.health();
    const assertion = expect(result).rejects.toMatchObject({ code: "TIMEOUT" });

    await vi.advanceTimersByTimeAsync(1_001);
    await assertion;
  });

  it("sends an explicit no-cache policy for a rematch resolve", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      state: "no-match",
      queries: [],
      candidates: [],
      reason: "none",
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new LyricsGatewayClient(() => "https://gateway.example", () => 7_000);

    await client.resolve(track, undefined, true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/resolve",
      expect.objectContaining({ cache: "no-store", headers: expect.objectContaining({ "cache-control": "no-cache" }) }),
    );
  });

  it("bypasses gateway caches for a custom metadata search", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      schemaVersion: 1,
      queries: ["Song Artist"],
      candidates: [],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const client = new LyricsGatewayClient(() => "https://gateway.example", () => 7_000);

    await client.search(track, undefined, undefined, true);

    expect(fetchMock).toHaveBeenCalledWith(
      "https://gateway.example/v1/search",
      expect.objectContaining({ cache: "no-store", headers: expect.objectContaining({ "cache-control": "no-cache" }) }),
    );
  });
});
