import "fake-indexeddb/auto";
import type { LyricsResponse, TrackQuery } from "@cider-netease/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactive } from "vue";
import { MappingStore, migrateMappingRecord, validSchemaRecord } from "../src/stores/mapping-store";

const track: TrackQuery = { appleMusicId: "apple-1", title: "Song", artist: "Artist", album: "Album", durationMs: 200_000 };
const lyrics: LyricsResponse = {
  schemaVersion: 1,
  lyrics: { type: "Line", source: "NetEase", neteaseId: "9", lyrics: [{ start: 1, end: 3, text: "Line", words: [], empty: false }] },
  diagnostics: {
    fields: { lrc: true, tlyric: false, romalrc: false, yrc: false },
    unmatchedTranslations: [],
    translationCjkRatio: 0,
    translationIsChinese: false,
    parsedRomanizationLines: 0,
  },
};

beforeEach(async () => {
  const store = new MappingStore();
  await Promise.all([store.clearMappings(), store.clearLyrics(), store.clearFailure("apple:apple-1")]);
});

afterEach(() => vi.restoreAllMocks());

describe("cache schema migration", () => {
  it("upgrades a v0 mapping and rebuilds its metadata fingerprint", () => {
    const migrated = migrateMappingRecord({
      schemaVersion: 0,
      trackKey: "apple:1",
      neteaseId: "9",
      track: { appleMusicId: "1", title: "Song", artist: "Artist", album: "Album", durationMs: 200_000 },
    });
    expect(migrated).toMatchObject({ schemaVersion: 1, trackKey: "apple:1", neteaseId: "9" });
    expect(migrated?.fingerprint).toContain("song");
    expect(migrated?.updatedAt).toBeTypeOf("number");
  });

  it("rejects unknown future cache schemas instead of misreading them", () => {
    expect(validSchemaRecord({ schemaVersion: 99, value: "future" })).toBeUndefined();
    expect(migrateMappingRecord({ schemaVersion: 99, trackKey: "x", neteaseId: "1", track: {} })).toBeUndefined();
  });

  it("persists manual mappings across store instances and rejects changed metadata", async () => {
    const first = new MappingStore();
    await first.saveMapping("apple:apple-1", track, "9");

    const reopened = new MappingStore();
    expect(await reopened.getMapping("apple:apple-1", track)).toMatchObject({ neteaseId: "9", schemaVersion: 1 });
    expect(await reopened.listMappings()).toHaveLength(1);
    expect(await reopened.getMapping("apple:apple-1", { ...track, title: "Different" })).toBeUndefined();

    await reopened.deleteMapping("apple:apple-1");
    expect(await reopened.getMapping("apple:apple-1", track)).toBeUndefined();
  });

  it("snapshots Vue reactive track metadata before writing to IndexedDB", async () => {
    const store = new MappingStore();
    const reactiveTrack = reactive({ ...track });

    await expect(store.saveMapping("apple:reactive", reactiveTrack, "9")).resolves.toBeUndefined();

    expect(await store.getMapping("apple:reactive", track)).toMatchObject({
      neteaseId: "9",
      track,
    });
  });

  it("expires lyric and failure cache entries while retaining live values", async () => {
    let now = new Date("2026-08-10T00:00:00Z").getTime();
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const store = new MappingStore();
    await store.saveLyrics(lyrics, track.durationMs, 7);
    await store.saveFailure("apple:apple-1", "no-match");

    expect(await store.getLyrics("9", track.durationMs)).toEqual(lyrics);
    expect(await store.getFailure("apple:apple-1")).toBe("no-match");

    now += 11 * 60_000;
    expect(await store.getFailure("apple:apple-1")).toBeUndefined();
    expect(await store.getLyrics("9", track.durationMs)).toEqual(lyrics);

    now += 8 * 86_400_000;
    expect(await store.getLyrics("9", track.durationMs)).toBeUndefined();
  });

  it("clears all remembered mappings and lyric cache entries", async () => {
    const store = new MappingStore();
    await store.saveMapping("apple:apple-1", track, "9");
    await store.saveLyrics(lyrics, track.durationMs, 7);

    await Promise.all([store.clearMappings(), store.clearLyrics()]);

    expect(await store.listMappings()).toEqual([]);
    expect(await store.getMapping("apple:apple-1", track)).toBeUndefined();
    expect(await store.getLyrics("9", track.durationMs)).toBeUndefined();
  });
});
