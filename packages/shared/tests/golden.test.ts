import { describe, expect, it } from "vitest";
import goldenTracks from "../fixtures/golden-tracks.json";
import { scoreCandidate, selectCandidate, type RawTrackCandidate, type TrackQuery } from "../src";

describe("golden matching corpus", () => {
  it("contains every required first-release category", () => {
    const tags = new Set(goldenTracks.flatMap((sample) => sample.tags));
    for (const required of [
      "chinese", "english", "japanese", "korean", "multi-artist", "same-title", "live", "remastered",
      "acoustic", "instrumental", "single", "deluxe", "expanded", "no-lyrics", "no-translation", "long", "short",
    ]) {
      expect(tags.has(required), `missing golden tag: ${required}`).toBe(true);
    }
  });

  for (const sample of goldenTracks) {
    it(`ranks the expected NetEase ID first: ${sample.name}`, () => {
      const candidates = [sample.expected, ...sample.decoys].map((candidate) =>
        scoreCandidate(sample.track as TrackQuery, candidate as RawTrackCandidate),
      );
      const ranked = [...candidates].sort((left, right) => right.score - left.score);
      expect(ranked[0]?.neteaseId).toBe(sample.expected.neteaseId);
      const selection = selectCandidate(candidates);
      expect(selection.decision).not.toBe("none");
      if (selection.decision === "auto") expect(selection.selected?.neteaseId).toBe(sample.expected.neteaseId);
    });
  }
});
