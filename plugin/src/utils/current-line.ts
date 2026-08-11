import type { LyricLine } from "@cider-netease/shared";

export function findCurrentLine(lines: LyricLine[], timeSeconds: number): number {
  let low = 0;
  let high = lines.length - 1;
  let result = -1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const line = lines[middle];
    if (!line) break;
    if (line.start <= timeSeconds) {
      result = middle;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  if (result >= 0 && timeSeconds <= (lines[result]?.end ?? Number.POSITIVE_INFINITY)) return result;
  return result;
}
