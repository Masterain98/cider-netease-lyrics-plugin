import { describe, expect, it } from "vitest";
import { isNoLyricsContent, parseLrc } from "../src";

describe("LRC parsing", () => {
  it("supports hundredths, milliseconds, multiple timestamps, metadata, and duplicate timestamps", () => {
    const parsed = parseLrc(
      [
        "[ar:Artist]",
        "[offset:-250]",
        "[00:01.50][00:03.500]First",
        "[00:03.500]Second at same time",
        "[00:07.125]",
      ].join("\n"),
      10_000,
    );
    expect(parsed.metadata.ar).toBe("Artist");
    expect(parsed.offsetMs).toBe(-250);
    expect(parsed.lines.map((line) => line.start)).toEqual([1.25, 3.25, 3.25, 6.875]);
    expect(parsed.lines[0]?.end).toBe(3.25);
    expect(parsed.lines[1]?.end).toBe(6.875);
    expect(parsed.lines[2]?.end).toBe(6.875);
    expect(parsed.lines[3]?.end).toBe(10);
    expect(parsed.lines[3]?.empty).toBe(true);
  });

  it("marks common credit lines", () => {
    const parsed = parseLrc("[00:00.000]作词：某人\n[00:02.000]The song begins");
    expect(parsed.lines[0]?.isCredit).toBe(true);
    expect(parsed.lines[1]?.isCredit).toBe(false);
  });

  it("recognizes empty and instrumental payloads", () => {
    expect(isNoLyricsContent(undefined)).toBe(true);
    expect(isNoLyricsContent("[00:00.00]纯音乐")).toBe(true);
    expect(isNoLyricsContent("[00:00.00]A real lyric")).toBe(false);
  });
});
