import type { LyricLine } from "./domain";

export interface ParsedLrc {
  lines: LyricLine[];
  metadata: Record<string, string>;
  offsetMs: number;
}

const CREDIT_PATTERN = /^(?:作词|作曲|编曲|词|曲|lyrics?|composer|arranger|producer|written\s+by|translated\s+by)\s*[:：]/iu;
const TIME_TAG = /\[(-?\d{1,3}):([0-5]?\d)(?:[.:](\d{1,3}))?\]/gu;
const METADATA_TAG = /^\[([a-z]+):([^\]]*)\]\s*$/iu;

function fractionToMilliseconds(fraction?: string): number {
  if (!fraction) return 0;
  if (fraction.length === 1) return Number(fraction) * 100;
  if (fraction.length === 2) return Number(fraction) * 10;
  return Number(fraction.slice(0, 3));
}

function endTimes(lines: LyricLine[], durationSeconds?: number): LyricLine[] {
  return lines.map((line, index) => {
    const next = lines.slice(index + 1).find((candidate) => candidate.start > line.start);
    const fallbackEnd = durationSeconds && durationSeconds > line.start ? durationSeconds : line.start + 5;
    return { ...line, end: Math.max(line.start + 0.05, next?.start ?? fallbackEnd), index };
  });
}

export function parseLrc(source: string | undefined | null, durationMs?: number): ParsedLrc {
  if (!source) return { lines: [], metadata: {}, offsetMs: 0 };
  const rawLines = source.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  const metadata: Record<string, string> = {};
  let offsetMs = 0;

  for (const rawLine of rawLines) {
    const metadataMatch = rawLine.trim().match(METADATA_TAG);
    if (!metadataMatch) continue;
    const key = metadataMatch[1]?.toLocaleLowerCase("en-US") ?? "";
    const value = metadataMatch[2]?.trim() ?? "";
    if (key === "offset") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) offsetMs = parsed;
    } else if (["ar", "ti", "al", "by", "re", "ve"].includes(key)) {
      metadata[key] = value;
    }
  }

  const parsed: Array<LyricLine & { order: number }> = [];
  let order = 0;
  for (const rawLine of rawLines) {
    const matches = [...rawLine.matchAll(TIME_TAG)];
    if (matches.length === 0) continue;
    const text = rawLine.replace(TIME_TAG, "").trim();
    for (const match of matches) {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const milliseconds = fractionToMilliseconds(match[3]);
      const rawStart = minutes * 60 + seconds + milliseconds / 1000 + offsetMs / 1000;
      parsed.push({
        start: Math.max(0, Math.round(rawStart * 1000) / 1000),
        end: 0,
        text,
        words: [],
        empty: text.length === 0,
        isCredit: CREDIT_PATTERN.test(text),
        order,
      });
      order += 1;
    }
  }

  parsed.sort((left, right) => left.start - right.start || left.order - right.order);
  const lines = parsed.map(({ order: _order, ...line }) => line);
  return { lines: endTimes(lines, durationMs ? durationMs / 1000 : undefined), metadata, offsetMs };
}

export function isNoLyricsContent(source: string | undefined | null): boolean {
  if (!source?.trim()) return true;
  const content = parseLrc(source).lines.map((line) => line.text).join(" ").trim();
  return !content || /^(?:纯音乐|instrumental|暂无歌词|no\s+lyrics)$/iu.test(content);
}
