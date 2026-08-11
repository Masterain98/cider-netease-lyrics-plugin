import type { LyricsResponse, ResolveResponse, SearchResponse, TrackQuery } from "@cider-netease/shared";
import { nextTick } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PluginError } from "../src/domain/errors";
import { LyricController, lyricState } from "../src/stores/lyric-store";
import { settings } from "../src/stores/settings-store";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function ready(track: TrackQuery, id: string): ResolveResponse {
  return {
    schemaVersion: 1,
    state: "ready",
    queries: [`${track.title} ${track.artist}`],
    candidates: [],
    match: {
      neteaseId: id,
      title: track.title,
      artists: [track.artist],
      album: track.album,
      score: 1,
      scoreBreakdown: { title: 0.45, album: 0.25, artist: 0.2, duration: 0.1, versionPenalty: 0 },
      versionTags: [],
      severeVersionConflict: false,
    },
    lyrics: {
      type: "Line",
      source: "NetEase",
      neteaseId: id,
      lyrics: [{ start: 0, end: 5, text: track.title, words: [], empty: false }],
    },
    lyricDiagnostics: {
      fields: { lrc: true, tlyric: false, romalrc: false, yrc: false },
      unmatchedTranslations: [],
      translationCjkRatio: 0,
      translationIsChinese: false,
      parsedRomanizationLines: 0,
    },
    reason: "test",
  };
}

function lyricsFor(track: TrackQuery, id: string): LyricsResponse {
  const response = ready(track, id);
  return { schemaVersion: 1, lyrics: response.lyrics!, diagnostics: response.lyricDiagnostics! };
}

function storageDouble() {
  return {
    getMapping: vi.fn().mockResolvedValue(undefined),
    saveMapping: vi.fn().mockResolvedValue(undefined),
    deleteMapping: vi.fn().mockResolvedValue(undefined),
    getLyrics: vi.fn().mockResolvedValue(undefined),
    saveLyrics: vi.fn().mockResolvedValue(undefined),
    getFailure: vi.fn().mockResolvedValue(undefined),
    saveFailure: vi.fn().mockResolvedValue(undefined),
    clearFailure: vi.fn().mockResolvedValue(undefined),
  };
}

describe("track request state management", () => {
  beforeEach(() => {
    settings.autoMatch = true;
    settings.connectionMode = "direct";
    settings.cacheEnabled = false;
    lyricState.source = "netease";
    lyricState.status = "idle";
  });

  afterEach(() => vi.unstubAllGlobals());

  it("discards a late response after a rapid track change", async () => {
    const first = deferred<ResolveResponse>();
    const second = deferred<ResolveResponse>();
    const trackOne = { appleMusicId: "1", title: "First", artist: "Artist", album: "Album" };
    const trackTwo = { appleMusicId: "2", title: "Second", artist: "Artist", album: "Album" };
    const client = {
      resolve: vi.fn((track: TrackQuery) => (track.appleMusicId === "1" ? first.promise : second.promise)),
      search: vi.fn<(_track: TrackQuery, _query: string | undefined) => Promise<SearchResponse>>(),
      lyrics: vi.fn<(_id: string) => Promise<LyricsResponse>>(),
    };
    const storage = storageDouble();
    const controller = new LyricController({ client, storage, trackAdapter: { start: vi.fn(), stop: vi.fn() } });

    const firstRun = controller.processTrack(trackOne, true);
    await Promise.resolve();
    const secondRun = controller.processTrack(trackTwo, true);
    await Promise.resolve();
    second.resolve(ready(trackTwo, "22"));
    await secondRun;
    expect(lyricState.lyrics?.neteaseId).toBe("22");
    first.resolve(ready(trackOne, "11"));
    await firstRun;
    expect(lyricState.track?.appleMusicId).toBe("2");
    expect(lyricState.lyrics?.neteaseId).toBe("22");
  });

  it("marks an explicit rematch request as a gateway cache bypass", async () => {
    const track = { appleMusicId: "3", title: "Fresh", artist: "Artist", album: "Album" };
    const client = {
      resolve: vi.fn().mockResolvedValue(ready(track, "33")),
      search: vi.fn<(_track: TrackQuery, _query: string | undefined) => Promise<SearchResponse>>(),
      lyrics: vi.fn<(_id: string) => Promise<LyricsResponse>>(),
    };
    const storage = storageDouble();
    const controller = new LyricController({ client, storage, trackAdapter: { start: vi.fn(), stop: vi.fn() } });

    await controller.processTrack(track, true);

    expect(client.resolve).toHaveBeenCalledWith(track, expect.any(AbortSignal), true);
  });

  it("deletes a remembered mapping and its failure cooldown before rematching", async () => {
    const track = { appleMusicId: "3b", title: "Again", artist: "Artist", album: "Album" };
    const client = {
      resolve: vi.fn().mockResolvedValue(ready(track, "34")),
      search: vi.fn<(_track: TrackQuery, _query: string | undefined) => Promise<SearchResponse>>(),
      lyrics: vi.fn<(_id: string) => Promise<LyricsResponse>>(),
    };
    const storage = storageDouble();
    const controller = new LyricController({ client, storage, trackAdapter: { start: vi.fn(), stop: vi.fn() } });

    await controller.processTrack(track);
    const trackKey = lyricState.trackKey!;
    await controller.rematch();

    expect(storage.deleteMapping).toHaveBeenCalledWith(trackKey);
    expect(storage.clearFailure).toHaveBeenCalledWith(trackKey);
    expect(client.resolve).toHaveBeenLastCalledWith(track, expect.any(AbortSignal), true);
  });

  it("clears previous lyrics without making a request when playback becomes empty", async () => {
    const client = { resolve: vi.fn(), search: vi.fn(), lyrics: vi.fn() };
    const controller = new LyricController({ client, storage: storageDouble(), trackAdapter: { start: vi.fn(), stop: vi.fn() } });
    lyricState.lyrics = lyricsFor({ title: "Old", artist: "Artist", album: "Album" }, "1").lyrics;

    await controller.processTrack(null);

    expect(lyricState.status).toBe("idle");
    expect(lyricState.track).toBeNull();
    expect(lyricState.lyrics).toBeNull();
    expect(client.resolve).not.toHaveBeenCalled();
  });

  it("uses a valid local mapping and lyric cache before contacting the gateway", async () => {
    settings.cacheEnabled = true;
    const track = { appleMusicId: "4", title: "Mapped", artist: "Artist", album: "Album", durationMs: 180_000 };
    const cached = lyricsFor(track, "44");
    const storage = storageDouble();
    storage.getMapping.mockResolvedValue({ schemaVersion: 1, trackKey: "apple:4", fingerprint: "mapped", neteaseId: "44", track, updatedAt: 1 });
    storage.getLyrics.mockResolvedValue(cached);
    const client = { resolve: vi.fn(), search: vi.fn(), lyrics: vi.fn() };
    const controller = new LyricController({ client, storage, trackAdapter: { start: vi.fn(), stop: vi.fn() } });

    await controller.processTrack(track);

    expect(lyricState.status).toBe("ready");
    expect(lyricState.lyrics?.neteaseId).toBe("44");
    expect(lyricState.diagnostics.cache).toBe("hit");
    expect(client.resolve).not.toHaveBeenCalled();
    expect(client.lyrics).not.toHaveBeenCalled();
  });

  it("keeps a one-time manual choice ephemeral and persists a remembered choice", async () => {
    const track = { appleMusicId: "5", title: "Manual", artist: "Artist", album: "Album", durationMs: 210_000 };
    const candidate = ready(track, "55").match!;
    const storage = storageDouble();
    const client = {
      resolve: vi.fn().mockResolvedValue({ schemaVersion: 1, state: "selecting-candidate", queries: ["Manual Artist"], candidates: [candidate], reason: "close candidates" }),
      search: vi.fn(),
      lyrics: vi.fn().mockResolvedValue(lyricsFor(track, "55")),
    };
    const controller = new LyricController({ client, storage, trackAdapter: { start: vi.fn(), stop: vi.fn() } });
    await controller.processTrack(track, true);

    await controller.chooseCandidate(candidate, false);
    expect(storage.saveMapping).not.toHaveBeenCalled();
    expect(lyricState.status).toBe("ready");

    await controller.processTrack(track, true);

    await controller.chooseCandidate(candidate, true);

    expect(storage.saveMapping).toHaveBeenCalledWith(expect.any(String), track, "55");
    expect(lyricState.status).toBe("ready");
    expect(lyricState.lyrics?.neteaseId).toBe("55");
  });

  it("runs a manual query and exposes its candidates and diagnostics", async () => {
    const track = { appleMusicId: "5b", title: "Manual Search", artist: "Artist", album: "Album" };
    const candidate = ready(track, "56").match!;
    const client = {
      resolve: vi.fn().mockResolvedValue({ schemaVersion: 1, state: "no-match", queries: [], candidates: [], reason: "none" }),
      search: vi.fn().mockResolvedValue({ schemaVersion: 1, queries: ["custom query"], candidates: [candidate] }),
      lyrics: vi.fn(),
    };
    const controller = new LyricController({ client, storage: storageDouble(), trackAdapter: { start: vi.fn(), stop: vi.fn() } });
    await controller.processTrack(track, true);

    await controller.manualSearch("custom query");

    expect(client.search).toHaveBeenCalledWith(track, "custom query", expect.any(AbortSignal));
    expect(lyricState.status).toBe("selecting-candidate");
    expect(lyricState.candidates).toEqual([candidate]);
    expect(lyricState.diagnostics.searchQueries).toEqual(["custom query"]);
  });

  it("searches and scores with user-confirmed song metadata while keeping the playback identity", async () => {
    const track = { appleMusicId: "custom", title: "Original", artist: "Original Artist", album: "Original Album", durationMs: 202_000 };
    const customTrack = { ...track, title: "Edited Song", artist: "Edited Artist", album: "Edited Album" };
    const candidate = ready(customTrack, "57").match!;
    const client = {
      resolve: vi.fn(),
      search: vi.fn().mockResolvedValue({ schemaVersion: 1, queries: ["Edited Song Edited Artist"], candidates: [candidate] }),
      lyrics: vi.fn(),
    };
    const controller = new LyricController({ client, storage: storageDouble(), trackAdapter: { start: vi.fn(), stop: vi.fn() } });
    lyricState.track = track;

    await controller.customSearch({ title: "  Edited Song ", artist: " Edited Artist  ", album: " Edited Album " });

    expect(client.search).toHaveBeenCalledWith(customTrack, undefined, expect.any(AbortSignal), true);
    expect(lyricState.track).toEqual(track);
    expect(lyricState.status).toBe("selecting-candidate");
    expect(lyricState.candidates).toEqual([candidate]);
  });

  it("switches to Cider's Apple Music lyrics for the current song and restores NetEase on request", async () => {
    const track = { appleMusicId: "apple-fallback", title: "Fallback", artist: "Artist", album: "Album" };
    const client = {
      resolve: vi.fn().mockResolvedValue(ready(track, "58")),
      search: vi.fn(),
      lyrics: vi.fn(),
    };
    const controller = new LyricController({ client, storage: storageDouble(), trackAdapter: { start: vi.fn(), stop: vi.fn() } });
    lyricState.track = track;
    lyricState.status = "no-lyrics";

    controller.useAppleMusicLyrics();
    expect(lyricState.source).toBe("apple-music");
    expect(lyricState.status).toBe("idle");

    await controller.useNetEaseLyrics();
    expect(lyricState.source).toBe("netease");
    expect(lyricState.status).toBe("ready");
    expect(client.resolve).toHaveBeenCalledWith(track, expect.any(AbortSignal), true);
  });

  it.each([
    [new PluginError("TIMEOUT", "slow"), "timeout"],
    [new PluginError("RATE_LIMITED", "busy"), "rate-limited"],
    [new PluginError("UPSTREAM_UNAVAILABLE", "offline"), "service-error"],
  ] as const)("maps gateway failure %s to state %s without throwing into playback", async (error, expectedState) => {
    const track = { appleMusicId: "6", title: "Failure", artist: "Artist", album: "Album" };
    const client = { resolve: vi.fn().mockRejectedValue(error), search: vi.fn(), lyrics: vi.fn() };
    const controller = new LyricController({ client, storage: storageDouble(), trackAdapter: { start: vi.fn(), stop: vi.fn() } });

    await expect(controller.processTrack(track, true)).resolves.toBeUndefined();

    expect(lyricState.status).toBe(expectedState);
    expect(lyricState.errorMessage).toBe(error.message);
  });

  it("preserves direct-mode error codes and user guidance in diagnostics", async () => {
    const error = new PluginError(
      "DIRECT_CONNECTION_FAILED",
      "无法直连；可能是网络、DNS、TLS 或 CORS。可在插件设置中手动切换到网关模式。",
    );
    const track = { appleMusicId: "direct-error", title: "Failure", artist: "Artist", album: "Album" };
    const controller = new LyricController({
      client: { resolve: vi.fn().mockRejectedValue(error), search: vi.fn(), lyrics: vi.fn() },
      storage: storageDouble(),
      trackAdapter: { start: vi.fn(), stop: vi.fn() },
    });

    await controller.processTrack(track, true);

    expect(lyricState.status).toBe("service-error");
    expect(lyricState.diagnostics.lastErrorCode).toBe("DIRECT_CONNECTION_FAILED");
    expect(lyricState.errorMessage).toContain("手动切换到网关模式");
  });

  it("short-caches a no-match outcome and avoids a second gateway request", async () => {
    settings.cacheEnabled = true;
    const track = { appleMusicId: "7", title: "Missing", artist: "Artist", album: "Album" };
    const storage = storageDouble();
    const client = {
      resolve: vi.fn().mockResolvedValue({ schemaVersion: 1, state: "no-match", queries: ["Missing Artist"], candidates: [], reason: "none" }),
      search: vi.fn(),
      lyrics: vi.fn(),
    };
    const controller = new LyricController({ client, storage, trackAdapter: { start: vi.fn(), stop: vi.fn() } });

    await controller.processTrack(track);
    expect(storage.saveFailure).toHaveBeenCalledWith(expect.any(String), "no-match");
    storage.getFailure.mockResolvedValue("no-match");
    await controller.processTrack(track);

    expect(client.resolve).toHaveBeenCalledTimes(1);
    expect(lyricState.status).toBe("no-match");
  });

  it("starts the track monitor only once and releases it on plugin shutdown", () => {
    vi.stubGlobal("window", { __PLUGINSYS__: { Stores: { appleMusicStore: {} }, Components: {} } });
    vi.stubGlobal("customElements", { get: vi.fn().mockReturnValue(undefined) });
    const trackAdapter = { start: vi.fn(), stop: vi.fn() };
    const controller = new LyricController({
      client: { resolve: vi.fn(), search: vi.fn(), lyrics: vi.fn() },
      storage: storageDouble(),
      trackAdapter,
    });

    controller.start();
    controller.start();
    controller.stop();

    expect(trackAdapter.start).toHaveBeenCalledTimes(1);
    expect(trackAdapter.stop).toHaveBeenCalledTimes(1);
  });

  it("cancels the old request and reuses a manual mapping with cache bypass after a mode switch", async () => {
    vi.stubGlobal("window", { __PLUGINSYS__: { Stores: { appleMusicStore: {} }, Components: {} } });
    vi.stubGlobal("customElements", { get: vi.fn().mockReturnValue(undefined) });
    const track = { appleMusicId: "mode", title: "Mode", artist: "Artist", album: "Album", durationMs: 180_000 };
    const storage = storageDouble();
    storage.getMapping.mockResolvedValue({ schemaVersion: 1, trackKey: "apple:mode", fingerprint: "mode", neteaseId: "88", track, updatedAt: 1 });
    const first = deferred<LyricsResponse>();
    let firstSignal: AbortSignal | undefined;
    const client = {
      resolve: vi.fn(),
      search: vi.fn(),
      lyrics: vi.fn((_id: string, _duration: number | undefined, signal: AbortSignal | undefined) => {
        if (!firstSignal) {
          firstSignal = signal;
          return first.promise;
        }
        return Promise.resolve(lyricsFor(track, "88"));
      }),
    };
    const controller = new LyricController({ client, storage, trackAdapter: { start: vi.fn(), stop: vi.fn() } });
    controller.start();
    const firstRun = controller.processTrack(track, true);
    for (let index = 0; index < 10 && client.lyrics.mock.calls.length === 0; index += 1) await Promise.resolve();

    settings.connectionMode = "gateway";
    await nextTick();
    for (let index = 0; index < 10 && client.lyrics.mock.calls.length < 2; index += 1) await Promise.resolve();

    expect(firstSignal?.aborted).toBe(true);
    expect(client.lyrics).toHaveBeenCalledTimes(2);
    expect(client.lyrics).toHaveBeenLastCalledWith("88", track.durationMs, expect.any(AbortSignal), true);
    expect(storage.deleteMapping).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(lyricState.lyrics?.neteaseId).toBe("88"));
    expect(lyricState.diagnostics.connectionMode).toBe("gateway");
    controller.stop();
    first.resolve(lyricsFor(track, "88"));
    await firstRun;
  });

  it("starts through the guarded Cider player fallback when the PluginKit store is absent", () => {
    vi.stubGlobal("window", { __PLUGINSYS__: { Stores: {}, Components: {} }, CiderApp: { musicKitStore: { player: {} } } });
    vi.stubGlobal("customElements", { get: vi.fn().mockReturnValue(undefined) });
    const trackAdapter = { start: vi.fn(), stop: vi.fn() };
    const controller = new LyricController({
      client: { resolve: vi.fn(), search: vi.fn(), lyrics: vi.fn() },
      storage: storageDouble(),
      trackAdapter,
    });

    controller.start();

    expect(trackAdapter.start).toHaveBeenCalledTimes(1);
    expect(lyricState.diagnostics.trackSourceProbe).toContain("Guarded Cider player fallback");
    controller.stop();
  });

  it("fails closed with an explicit incompatibility state when the Cider store is absent", () => {
    vi.stubGlobal("window", { __PLUGINSYS__: { Stores: {}, Components: {} } });
    vi.stubGlobal("customElements", { get: vi.fn().mockReturnValue(undefined) });
    const trackAdapter = { start: vi.fn(), stop: vi.fn() };
    const controller = new LyricController({
      client: { resolve: vi.fn(), search: vi.fn(), lyrics: vi.fn() },
      storage: storageDouble(),
      trackAdapter,
    });

    controller.start();

    expect(trackAdapter.start).not.toHaveBeenCalled();
    expect(lyricState.status).toBe("service-error");
    expect(lyricState.diagnostics.lastErrorCode).toBe("INCOMPATIBLE_HOST");
    expect(lyricState.errorMessage).toBeNull();
  });
});
