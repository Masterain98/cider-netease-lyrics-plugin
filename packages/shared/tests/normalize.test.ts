import { describe, expect, it } from "vitest";
import { extractVersionTags, normalizeArtists, normalizeMetadata, normalizeText } from "../src";

describe("metadata normalization", () => {
  it("normalizes Unicode, punctuation, feature markers, and whitespace", () => {
    expect(normalizeText("  Ｈｅｌｌｏ—World（feat. Guest） ")).toBe("hello world feat guest");
  });

  it("removes release suffixes from comparable album names", () => {
    expect(normalizeMetadata("A New Day - EP", "album").comparable).toBe("a new day");
    expect(normalizeMetadata("A New Day - Single", "album").comparable).toBe("a new day");
  });

  it("extracts version markers instead of silently discarding their meaning", () => {
    expect(extractVersionTags("Song (Live / Remastered 2024) [Acoustic]")).toEqual(["live", "remaster", "acoustic"]);
  });

  it("compares multi-artist credits independently of common separators", () => {
    expect(normalizeArtists("A feat. B、C & D")).toEqual(["a", "b", "c", "d"]);
  });
});
