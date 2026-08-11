import { describe, expect, it } from "vitest";
import { findCurrentLine } from "../src/utils/current-line";

const lines = [
  { start: 1, end: 3, text: "One", words: [], empty: false },
  { start: 3, end: 5, text: "Two", words: [], empty: false },
  { start: 5, end: 8, text: "Three", words: [], empty: false },
];

describe("current lyric lookup", () => {
  it("uses binary search across boundaries and seeks", () => {
    expect(findCurrentLine(lines, 0.5)).toBe(-1);
    expect(findCurrentLine(lines, 1)).toBe(0);
    expect(findCurrentLine(lines, 4.2)).toBe(1);
    expect(findCurrentLine(lines, 7.9)).toBe(2);
    expect(findCurrentLine(lines, 10)).toBe(2);
  });
});
