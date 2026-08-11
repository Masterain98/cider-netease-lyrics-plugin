import { SCHEMA_VERSION, type LyricDiagnostics, type LyricLine, type LyricsResponse } from "./domain";
import { isNoLyricsContent, parseLrc } from "./lrc";

export interface RawNeteaseLyrics {
  lrc?: string | undefined;
  tlyric?: string | undefined;
  romalrc?: string | undefined;
  yrc?: string | undefined;
}

export function cjkRatio(value: string): number {
  const visible = [...value].filter((character) => /[\p{L}\p{N}]/u.test(character));
  if (visible.length === 0) return 0;
  const cjk = visible.filter((character) => /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(character));
  return cjk.length / visible.length;
}

export function mergeTranslation(
  originals: LyricLine[],
  translations: LyricLine[],
  toleranceSeconds = 0.4,
): { lines: LyricLine[]; unmatched: Array<{ start: number; text: string }> } {
  const unused = new Set(translations.map((_, index) => index));
  const lines = originals.map((original) => {
    let matchedIndex = translations.findIndex(
      (translation, index) => unused.has(index) && Math.abs(translation.start - original.start) < 0.0005,
    );
    if (matchedIndex < 0) {
      let nearestDistance = Number.POSITIVE_INFINITY;
      translations.forEach((translation, index) => {
        if (!unused.has(index)) return;
        const distance = Math.abs(translation.start - original.start);
        if (distance <= toleranceSeconds && distance < nearestDistance) {
          nearestDistance = distance;
          matchedIndex = index;
        }
      });
    }
    if (matchedIndex < 0) return original;
    unused.delete(matchedIndex);
    const translation = translations[matchedIndex];
    if (!translation?.text) return original;
    return { ...original, translation: translation.text };
  });
  const unmatched = [...unused]
    .map((index) => translations[index])
    .filter((line): line is LyricLine => Boolean(line?.text))
    .map((line) => ({ start: line.start, text: line.text }));
  return { lines, unmatched };
}

export function buildLyricResponse(neteaseId: string, raw: RawNeteaseLyrics, durationMs?: number): LyricsResponse | null {
  if (isNoLyricsContent(raw.lrc)) return null;
  const original = parseLrc(raw.lrc, durationMs);
  if (original.lines.length === 0) return null;
  const translation = parseLrc(raw.tlyric, durationMs);
  const romanization = parseLrc(raw.romalrc, durationMs);
  const merged = mergeTranslation(original.lines, translation.lines);
  const translationText = translation.lines.map((line) => line.text).join("");
  const ratio = cjkRatio(translationText);
  const diagnostics: LyricDiagnostics = {
    fields: {
      lrc: Boolean(raw.lrc?.trim()),
      tlyric: Boolean(raw.tlyric?.trim()),
      romalrc: Boolean(raw.romalrc?.trim()),
      yrc: Boolean(raw.yrc?.trim()),
    },
    unmatchedTranslations: merged.unmatched,
    translationCjkRatio: Math.round(ratio * 10_000) / 10_000,
    translationIsChinese: translation.lines.length > 0 && ratio >= 0.2,
    parsedRomanizationLines: romanization.lines.length,
  };
  return {
    schemaVersion: SCHEMA_VERSION,
    lyrics: { type: "Line", lyrics: merged.lines, source: "NetEase", neteaseId },
    diagnostics,
  };
}
