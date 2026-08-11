import type { RawNeteaseLyrics, RawTrackCandidate } from "@cider-netease/shared";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { NeteasePort } from "../src/netease/types";

const config = loadConfig({
  CORS_ORIGINS: "https://allowed.example",
  REQUEST_TIMEOUT_MS: "3000",
  RATE_LIMIT_PER_MINUTE: "100",
});

class FakeNetease implements NeteasePort {
  searchCalls: string[] = [];
  lyricCalls: string[] = [];
  cacheBypasses: boolean[] = [];

  constructor(
    private readonly candidates: RawTrackCandidate[],
    private readonly lyricPayload: RawNeteaseLyrics,
  ) {}

  async search(keywords: string, _limit: number, bypassCache = false): Promise<RawTrackCandidate[]> {
    this.searchCalls.push(keywords);
    this.cacheBypasses.push(bypassCache);
    return this.candidates;
  }

  async lyrics(neteaseId: string, bypassCache = false): Promise<RawNeteaseLyrics> {
    this.lyricCalls.push(neteaseId);
    this.cacheBypasses.push(bypassCache);
    return this.lyricPayload;
  }
}

const track = {
  appleMusicId: "apple-1",
  title: "Northern Lights",
  artist: "Example Artist",
  album: "Northern Lights - Single",
  durationMs: 241_320,
};

describe("gateway routes", () => {
  it("allows the local Cider and Vite origins by default", () => {
    expect(loadConfig({}).corsOrigins).toEqual([
      "http://127.0.0.1:10767",
      "http://localhost:10767",
      "http://127.0.0.1:3058",
      "http://localhost:3058",
    ]);
  });

  it("exposes a health route without contacting NetEase", async () => {
    const netease = new FakeNetease([], {});
    const response = await createApp({ config, netease }).request("/health");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ok", schemaVersion: 1 });
    expect(netease.searchCalls).toEqual([]);
  });

  it("resolves a high-confidence candidate and merges bilingual lyrics", async () => {
    const netease = new FakeNetease(
      [
        {
          neteaseId: "123",
          title: track.title,
          artists: [track.artist],
          album: "Northern Lights",
          durationMs: 241_000,
        },
      ],
      { lrc: "[00:01.000]Hello", tlyric: "[00:01.100]你好" },
    );
    const response = await createApp({ config, netease }).request("/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://allowed.example" },
      body: JSON.stringify(track),
    });
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("https://allowed.example");
    expect(await response.json()).toMatchObject({
      state: "ready",
      match: { neteaseId: "123" },
      lyrics: { source: "NetEase", neteaseId: "123", lyrics: [{ text: "Hello", translation: "你好" }] },
    });
  });

  it("returns candidates instead of silently selecting close matches", async () => {
    const near = {
      neteaseId: "1",
      title: track.title,
      artists: [track.artist],
      album: "Northern Lights",
      durationMs: 241_000,
    };
    const netease = new FakeNetease([near, { ...near, neteaseId: "2", durationMs: 242_000 }], {});
    const response = await createApp({ config, netease }).request("/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(track),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { state: string; candidates: Array<{ neteaseId: string }> };
    expect(body.state).toBe("selecting-candidate");
    expect(body.candidates.map((candidate) => candidate.neteaseId)).toEqual(["1", "2"]);
    expect(netease.lyricCalls).toEqual([]);
  });

  it("distinguishes empty search results from a matched song with no usable lyrics", async () => {
    const empty = await createApp({ config, netease: new FakeNetease([], {}) }).request("/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(track),
    });
    expect(await empty.json()).toMatchObject({ state: "no-match", candidates: [] });

    const matched = new FakeNetease(
      [{ neteaseId: "123", title: track.title, artists: [track.artist], album: track.album, durationMs: track.durationMs }],
      {},
    );
    const noLyrics = await createApp({ config, netease: matched }).request("/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(track),
    });
    expect(noLyrics.status).toBe(200);
    expect(await noLyrics.json()).toMatchObject({ state: "no-lyrics", match: { neteaseId: "123" } });
  });

  it("keeps non-whitelisted API routes closed and sanitizes invalid requests", async () => {
    const app = createApp({ config, netease: new FakeNetease([], {}) });
    const forbidden = await app.request("/login");
    expect(forbidden.status).toBe(404);
    const invalid = await app.request("/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "" }),
    });
    expect(invalid.status).toBe(400);
    const body = await invalid.text();
    expect(body).not.toContain("stack");
    expect(body).not.toContain("cookie");
  });

  it("supports manual search and direct lyric retrieval", async () => {
    const netease = new FakeNetease(
      [{ neteaseId: "9", title: "Manual", artists: ["Artist"], album: "Album" }],
      { lrc: "[00:01.000]Manual line" },
    );
    const app = createApp({ config, netease });
    const search = await app.request("/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ track, query: "manual words" }),
    });
    expect(search.status).toBe(200);
    expect(await search.json()).toMatchObject({ queries: ["manual words"], candidates: [{ neteaseId: "9" }] });
    const lyrics = await app.request("/v1/lyrics/9?durationMs=5000");
    expect(lyrics.status).toBe(200);
    expect(await lyrics.json()).toMatchObject({ lyrics: { neteaseId: "9" } });
  });

  it("propagates an explicit cache bypass to search and lyric upstream calls", async () => {
    const netease = new FakeNetease(
      [{ neteaseId: "10", title: track.title, artists: [track.artist], album: track.album, durationMs: track.durationMs }],
      { lrc: "[00:01.000]Fresh line" },
    );
    const response = await createApp({ config, netease }).request("/v1/resolve", {
      method: "POST",
      headers: { "content-type": "application/json", "cache-control": "no-cache" },
      body: JSON.stringify(track),
    });
    expect(response.status).toBe(200);
    expect(netease.cacheBypasses.length).toBeGreaterThan(1);
    expect(netease.cacheBypasses.every(Boolean)).toBe(true);
  });

  it("rate-limits repeated song keys without leaking request content", async () => {
    const strictConfig = loadConfig({
      RATE_LIMIT_PER_MINUTE: "100",
      RATE_LIMIT_PER_KEY_PER_MINUTE: "1",
      REQUEST_TIMEOUT_MS: "3000",
    });
    const app = createApp({ config: strictConfig, netease: new FakeNetease([], {}) });
    const request = () => app.request("/v1/search", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ track }),
    });
    expect((await request()).status).toBe(200);
    const limited = await request();
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    const body = await limited.text();
    expect(body).not.toContain(track.title);
    expect(body).not.toContain(track.artist);
  });
});
