import { describe, expect, it } from "vitest";
import {
  buildRankedSearchResponse,
  extractNeteaseLyrics,
  isNeteaseLyricsEnvelope,
  isNeteaseSearchEnvelope,
  normalizeNeteaseSearchCandidates,
  normalizeNeteaseSong,
  type TrackQuery,
} from "../src";

describe("NetEase response normalization", () => {
  it("normalizes modern and legacy song fields to the same candidate contract", () => {
    expect(normalizeNeteaseSong({ id: 1, name: "Song", ar: [{ name: "Artist" }], al: { name: "Album" }, dt: 123_000, alia: ["Alias"] }))
      .toEqual({ neteaseId: "1", title: "Song", artists: ["Artist"], album: "Album", durationMs: 123_000, aliases: ["Alias"] });
    expect(normalizeNeteaseSong({ id: "1", name: "Song", artists: [{ name: "Artist" }], album: { name: "Album" }, duration: 123_000, alias: ["Alias"] }))
      .toEqual({ neteaseId: "1", title: "Song", artists: ["Artist"], album: "Album", durationMs: 123_000, aliases: ["Alias"] });
  });

  it("drops malformed candidates while tolerating optional fields", () => {
    const payload = { code: 200, result: { songs: [{ name: "missing id" }, { id: 2, name: "Minimal" }] } };
    expect(isNeteaseSearchEnvelope(payload)).toBe(true);
    expect(normalizeNeteaseSearchCandidates(payload)).toEqual([{ neteaseId: "2", title: "Minimal", artists: [], album: "" }]);
    expect(isNeteaseSearchEnvelope({ code: 200 })).toBe(false);
  });

  it("extracts all supported raw lyric fields and recognizes no-lyric envelopes", () => {
    const payload = {
      code: 200,
      lrc: { lyric: "[00:00.00]original" },
      tlyric: { lyric: "[00:00.00]翻译" },
      romalrc: { lyric: "[00:00.00]romanized" },
      yrc: { lyric: "word data" },
    };
    expect(isNeteaseLyricsEnvelope(payload)).toBe(true);
    expect(extractNeteaseLyrics(payload)).toEqual({
      lrc: "[00:00.00]original",
      tlyric: "[00:00.00]翻译",
      romalrc: "[00:00.00]romanized",
      yrc: "word data",
    });
    expect(isNeteaseLyricsEnvelope({ code: 200, nolyric: true })).toBe(true);
    expect(isNeteaseLyricsEnvelope({ code: 200 })).toBe(false);
  });

  it("deduplicates multi-query candidates and keeps the highest shared score", () => {
    const track: TrackQuery = { title: "Song", artist: "Artist", album: "Album", durationMs: 120_000 };
    const candidate = { neteaseId: "1", title: "Song", artists: ["Artist"], album: "Album", durationMs: 120_000 };
    const response = buildRankedSearchResponse(track, ["Song Artist", "Song Album"], [[candidate], [candidate]]);
    expect(response.queries).toEqual(["Song Artist", "Song Album"]);
    expect(response.candidates).toHaveLength(1);
    expect(response.candidates[0]?.neteaseId).toBe("1");
  });
});
