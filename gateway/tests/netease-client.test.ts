import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config";
import { NeteaseClient, type NeteaseApi } from "../src/netease/client";

const config = loadConfig({
  UPSTREAM_TIMEOUT_MS: "1000",
  SEARCH_CACHE_TTL_MS: "60000",
  LYRICS_CACHE_TTL_MS: "60000",
  CIRCUIT_FAILURE_THRESHOLD: "5",
});

function apiDouble(): NeteaseApi {
  return { cloudsearch: vi.fn(), lyric: vi.fn() };
}

describe("NetEase API adapter", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("normalizes modern and legacy search fields and caches by normalized query", async () => {
    const api = apiDouble();
    vi.mocked(api.cloudsearch).mockResolvedValue({
      status: 200,
      body: {
        result: {
          songs: [
            { id: 1, name: "Modern", ar: [{ name: "A" }, { name: "B" }], al: { name: "Album" }, dt: 123_456, alia: ["Alias"] },
            { id: "2", name: "Legacy", artists: [{ name: "C" }], album: { name: "Old" }, duration: 222_000, alias: ["Alt"] },
            { name: "Missing ID" },
          ],
        },
      },
    });
    const client = new NeteaseClient(config, api);

    const first = await client.search("  SONG  ", 15);
    const cached = await client.search("  SONG  ", 15);

    expect(first).toEqual([
      { neteaseId: "1", title: "Modern", artists: ["A", "B"], album: "Album", durationMs: 123_456, aliases: ["Alias"] },
      { neteaseId: "2", title: "Legacy", artists: ["C"], album: "Old", durationMs: 222_000, aliases: ["Alt"] },
    ]);
    expect(cached).toEqual(first);
    expect(api.cloudsearch).toHaveBeenCalledTimes(1);

    await client.search("  SONG  ", 15, true);
    expect(api.cloudsearch).toHaveBeenCalledTimes(2);
  });

  it("returns an empty candidate list when NetEase omits the songs field", async () => {
    const api = apiDouble();
    vi.mocked(api.cloudsearch).mockResolvedValue({ status: 200, body: { result: {} } });

    await expect(new NeteaseClient(config, api).search("none", 10)).resolves.toEqual([]);
  });

  it("extracts only supported lyric fields and honors lyric cache bypass", async () => {
    const api = apiDouble();
    vi.mocked(api.lyric).mockResolvedValue({
      status: 200,
      body: {
        lrc: { lyric: "[00:01]Original" },
        tlyric: { lyric: "[00:01]翻译" },
        romalrc: { lyric: "[00:01]Romanized" },
        yrc: { lyric: "[1000,1000](0,500,0)Word" },
        ignored: { lyric: "private" },
      },
    });
    const client = new NeteaseClient(config, api);

    const parsed = await client.lyrics("9");
    await client.lyrics("9");
    expect(parsed).toEqual({
      lrc: "[00:01]Original",
      tlyric: "[00:01]翻译",
      romalrc: "[00:01]Romanized",
      yrc: "[1000,1000](0,500,0)Word",
    });
    expect(api.lyric).toHaveBeenCalledTimes(1);

    await client.lyrics("9", true);
    expect(api.lyric).toHaveBeenCalledTimes(2);
  });

  it("retries one temporary upstream response and then succeeds", async () => {
    const api = apiDouble();
    vi.mocked(api.cloudsearch)
      .mockResolvedValueOnce({ status: 503, body: {} })
      .mockResolvedValueOnce({ status: 200, body: { result: { songs: [] } } });

    await expect(new NeteaseClient(config, api).search("retry", 10)).resolves.toEqual([]);
    expect(api.cloudsearch).toHaveBeenCalledTimes(2);
  });

  it("maps a persistent upstream rejection to a sanitized gateway error", async () => {
    const api = apiDouble();
    vi.mocked(api.cloudsearch).mockRejectedValue(new Error("socket secret"));

    await expect(new NeteaseClient(config, api).search("failure", 10)).rejects.toMatchObject({
      code: "UPSTREAM_UNAVAILABLE",
      status: 503,
      message: "NetEase is unavailable.",
    });
    expect(api.cloudsearch).toHaveBeenCalledTimes(2);
  });
});
