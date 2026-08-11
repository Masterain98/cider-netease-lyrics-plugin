import { describe, expect, it } from "vitest";
import { canonicalTrackKeyInput, createTrackKey } from "../src";

describe("stable track keys", () => {
  it("prefers an Apple Music catalog ID", async () => {
    await expect(createTrackKey({ appleMusicId: "123", title: "A", artist: "B", album: "C" })).resolves.toBe("apple:123");
  });

  it("normalizes metadata and rounds duration when no catalog ID is available", async () => {
    const first = { title: "Song — Name", artist: "ARTIST", album: "Record - Single", durationMs: 240_900 };
    const second = { title: "song-name", artist: "artist", album: "Record", durationMs: 241_100 };
    expect(canonicalTrackKeyInput(first)).toBe(canonicalTrackKeyInput(second));
    await expect(createTrackKey(first)).resolves.toMatch(/^sha256:[a-f0-9]{64}$/u);
    await expect(createTrackKey(first)).resolves.toBe(await createTrackKey(second));
  });
});
