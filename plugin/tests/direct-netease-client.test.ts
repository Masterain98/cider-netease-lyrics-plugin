import type { TrackQuery } from "@cider-netease/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DirectNeteaseClient } from "../src/api/direct-netease-client";
import { PluginError } from "../src/domain/errors";

const track: TrackQuery = { title: "Hello", artist: "Adele", album: "25", durationMs: 295_000 };
const searchPayload = {
  code: 200,
  result: { songs: [{ id: 101, name: "Hello", artists: [{ name: "Adele" }], album: { name: "25" }, duration: 295_000 }] },
};
const lyricPayload = {
  code: 200,
  lrc: { lyric: "[00:00.00]Hello" },
  tlyric: { lyric: "[00:00.00]你好" },
  romalrc: { lyric: "" },
  yrc: { lyric: "" },
};

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("direct NetEase client", () => {
  it("uses encoded credential-free GET requests and resolves merged bilingual lyrics", async () => {
    const fetchMock = vi.fn((url: string, _init?: RequestInit) => Promise.resolve(url.includes("/api/search/get") ? json(searchPayload) : json(lyricPayload)));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DirectNeteaseClient(() => 7_000);

    const response = await client.resolve(track);

    expect(response.state).toBe("ready");
    expect(response.lyrics?.lyrics[0]).toMatchObject({ text: "Hello", translation: "你好" });
    const [searchUrl, init] = fetchMock.mock.calls[0]!;
    expect(searchUrl).toContain("https://music.163.com/api/search/get?");
    expect(searchUrl).toContain("s=Hello+Adele");
    expect(init).toEqual({ method: "GET", signal: expect.any(AbortSignal) });
    expect(init?.credentials).toBeUndefined();
    expect(init?.headers).toBeUndefined();
  });

  it("caches search for ten minutes and raw lyrics for one hour, with explicit bypass", async () => {
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.includes("/api/search/get") ? json(searchPayload) : json(lyricPayload)));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DirectNeteaseClient(() => 7_000);

    await client.resolve(track);
    const firstCount = fetchMock.mock.calls.length;
    await client.resolve(track);
    expect(fetchMock).toHaveBeenCalledTimes(firstCount);
    await client.resolve(track, undefined, true);
    expect(fetchMock.mock.calls.length).toBeGreaterThan(firstCount);
  });

  it("expires search and raw lyric memory caches at their separate TTLs", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-10T00:00:00Z"));
    const fetchMock = vi.fn((url: string) => Promise.resolve(url.includes("/api/search/get") ? json(searchPayload) : json(lyricPayload)));
    vi.stubGlobal("fetch", fetchMock);
    const client = new DirectNeteaseClient(() => 7_000);
    await client.resolve(track);
    const initialSearches = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/search/get")).length;
    const initialLyrics = fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/song/lyric")).length;

    vi.setSystemTime(new Date("2026-08-10T00:10:01Z"));
    await client.resolve(track);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/search/get")).length).toBeGreaterThan(initialSearches);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/song/lyric")).length).toBe(initialLyrics);

    vi.setSystemTime(new Date("2026-08-10T01:00:01Z"));
    await client.lyrics("101", track.durationMs);
    expect(fetchMock.mock.calls.filter(([url]) => String(url).includes("/api/song/lyric")).length).toBe(initialLyrics + 1);
  });

  it("retries one network failure and one HTTP 5xx, but no more", async () => {
    const networkFetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("fetch failed"))
      .mockResolvedValueOnce(json(searchPayload));
    vi.stubGlobal("fetch", networkFetch);
    const client = new DirectNeteaseClient(() => 7_000);
    await expect(client.probe()).resolves.toMatchObject({ status: "ok" });
    expect(networkFetch).toHaveBeenCalledTimes(2);

    const serverFetch = vi.fn().mockResolvedValueOnce(json({}, 503)).mockResolvedValueOnce(json(searchPayload));
    vi.stubGlobal("fetch", serverFetch);
    await expect(new DirectNeteaseClient(() => 7_000).probe()).resolves.toMatchObject({ status: "ok" });
    expect(serverFetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    [403, "DIRECT_ACCESS_BLOCKED"],
    [451, "DIRECT_ACCESS_BLOCKED"],
    [429, "RATE_LIMITED"],
  ] as const)("maps HTTP %i without retry to %s", async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(json({}, status));
    vi.stubGlobal("fetch", fetchMock);
    const error = await new DirectNeteaseClient(() => 7_000).probe().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PluginError);
    expect(error).toMatchObject({ code });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("reports network/CORS-type failures only after the single retry", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new DirectNeteaseClient(() => 7_000).probe()).rejects.toMatchObject({ code: "DIRECT_CONNECTION_FAILED" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("maps response-level access and rate-limit codes without retry", async () => {
    for (const [upstreamCode, expected] of [[451, "DIRECT_ACCESS_BLOCKED"], [429, "RATE_LIMITED"]] as const) {
      const fetchMock = vi.fn().mockResolvedValue(json({ code: upstreamCode, result: {} }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(new DirectNeteaseClient(() => 7_000).probe()).rejects.toMatchObject({ code: expected });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    }
  });

  it("stops after one retry when 5xx persists", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({}, 503));
    vi.stubGlobal("fetch", fetchMock);
    await expect(new DirectNeteaseClient(() => 7_000).probe()).rejects.toMatchObject({ code: "UPSTREAM_UNAVAILABLE" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reports invalid JSON and changed response structures precisely", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("not json", { status: 200 })));
    await expect(new DirectNeteaseClient(() => 7_000).probe()).rejects.toMatchObject({ code: "DIRECT_API_CHANGED" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ code: 200, unexpected: true })));
    await expect(new DirectNeteaseClient(() => 7_000).probe()).rejects.toMatchObject({ code: "DIRECT_API_CHANGED" });
  });

  it("honors caller cancellation and distinguishes it from timeout", async () => {
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const controller = new AbortController();
    const request = new DirectNeteaseClient(() => 7_000).probe(controller.signal);
    controller.abort();
    await expect(request).rejects.toMatchObject({ name: "AbortError" });

    vi.useFakeTimers();
    const timed = new DirectNeteaseClient(() => 1_000).probe();
    const assertion = expect(timed).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1_001);
    await assertion;
  });

  it("applies one total deadline across search and lyric phases", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((url: string, init: RequestInit) => {
      if (url.includes("/api/search/get")) {
        return new Promise<Response>((resolve) => setTimeout(() => resolve(json(searchPayload)), 600));
      }
      return new Promise<Response>((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true });
      });
    }));
    const request = new DirectNeteaseClient(() => 1_000).resolve(track);
    const assertion = expect(request).rejects.toMatchObject({ code: "TIMEOUT" });
    await vi.advanceTimersByTimeAsync(1_001);
    await assertion;
  });

  it("returns no-lyrics when the selected song has an explicit no-lyric envelope", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string) => Promise.resolve(url.includes("/api/search/get") ? json(searchPayload) : json({ code: 200, nolyric: true }))));
    await expect(new DirectNeteaseClient(() => 7_000).resolve(track)).resolves.toMatchObject({ state: "no-lyrics" });
  });

  it("reports a changed lyric response structure", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ code: 200, unexpected: true })));
    await expect(new DirectNeteaseClient(() => 7_000).lyrics("101")).rejects.toMatchObject({ code: "DIRECT_API_CHANGED" });
  });
});
