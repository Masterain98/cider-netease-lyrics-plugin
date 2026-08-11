import { describe, expect, it } from "vitest";
import { buildLyricResponse, cjkRatio, mergeTranslation, parseLrc } from "../src";

describe("translation merge", () => {
  it("prefers exact timestamps and then a bounded nearest match", () => {
    const originals = parseLrc("[00:01.000]One\n[00:05.000]Two\n[00:09.000]Three").lines;
    const translations = parseLrc("[00:01.000]一\n[00:05.280]二\n[00:10.000]不应挂接").lines;
    const merged = mergeTranslation(originals, translations, 0.4);
    expect(merged.lines.map((line) => line.translation)).toEqual(["一", "二", undefined]);
    expect(merged.unmatched).toEqual([{ start: 10, text: "不应挂接" }]);
  });

  it("builds a provider-compatible result and retains diagnostics", () => {
    const response = buildLyricResponse(
      "123",
      {
        lrc: "[00:01.000]Hello\n[00:05.000]World",
        tlyric: "[00:01.100]你好\n[00:05.000]世界",
        romalrc: "[00:01.000]Ni hao",
        yrc: "present",
      },
      8_000,
    );
    expect(response?.lyrics).toMatchObject({ type: "Line", source: "NetEase", neteaseId: "123" });
    expect(response?.lyrics.lyrics[0]?.translation).toBe("你好");
    expect(response?.diagnostics.fields).toEqual({ lrc: true, tlyric: true, romalrc: true, yrc: true });
    expect(response?.diagnostics.translationIsChinese).toBe(true);
    expect(response?.diagnostics.parsedRomanizationLines).toBe(1);
  });

  it("does not classify Latin-only translations as Chinese", () => {
    expect(cjkRatio("This is only Latin text")).toBe(0);
  });
});
