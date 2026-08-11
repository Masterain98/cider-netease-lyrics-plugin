import { describe, expect, it } from "vitest";
import { buildSearchQueries, scoreCandidate, selectCandidate, type TrackQuery } from "../src";

const query: TrackQuery = {
  title: "Northern Lights",
  artist: "Example Artist",
  album: "Northern Lights - Single",
  durationMs: 241_320,
};

describe("candidate scoring and selection", () => {
  it("scores a matching studio recording highly", () => {
    const candidate = scoreCandidate(query, {
      neteaseId: "1",
      title: "Northern Lights",
      artists: ["Example Artist"],
      album: "Northern Lights",
      durationMs: 241_000,
    });
    expect(candidate.score).toBeGreaterThanOrEqual(0.99);
    expect(candidate.severeVersionConflict).toBe(false);
  });

  it("penalizes Live, Acoustic, and Instrumental mismatches", () => {
    for (const version of ["Live", "Acoustic", "Instrumental"]) {
      const candidate = scoreCandidate(query, {
        neteaseId: version,
        title: `Northern Lights (${version})`,
        artists: ["Example Artist"],
        album: "Northern Lights",
        durationMs: 241_000,
      });
      expect(candidate.severeVersionConflict).toBe(true);
      expect(candidate.scoreBreakdown.versionPenalty).toBeGreaterThanOrEqual(0.22);
    }
  });

  it("only auto-selects a high-confidence candidate with a sufficient lead", () => {
    const best = scoreCandidate(query, {
      neteaseId: "1",
      title: query.title,
      artists: [query.artist],
      album: "Northern Lights",
      ...(query.durationMs ? { durationMs: query.durationMs } : {}),
    });
    const runnerUp = { ...best, neteaseId: "2", score: best.score - 0.09 };
    expect(selectCandidate([runnerUp, best]).decision).toBe("auto");
    expect(selectCandidate([best, { ...runnerUp, score: best.score - 0.03 }]).decision).toBe("manual");
  });

  it("uses the required query fallback order without duplicates", () => {
    expect(buildSearchQueries(query)).toEqual([
      "Northern Lights Example Artist",
      "Northern Lights Northern Lights",
      "northern lights",
    ]);
  });
});
