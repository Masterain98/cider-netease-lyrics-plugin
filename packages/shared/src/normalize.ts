import type { VersionTag } from "./domain";

const VERSION_PATTERNS: ReadonlyArray<[VersionTag, RegExp]> = [
  ["live", /\b(?:live|concert|现场|ライブ)\b/iu],
  ["remaster", /\b(?:re-?master(?:ed)?|\d{4}\s+remaster)\b/iu],
  ["acoustic", /\b(?:acoustic|unplugged|不插电)\b/iu],
  ["instrumental", /\b(?:instrumental|伴奏|纯音乐)\b/iu],
  ["demo", /\bdemo\b/iu],
  ["radio-edit", /\bradio\s+(?:edit|mix|version)\b/iu],
  ["karaoke", /\b(?:karaoke|卡拉ok)\b/iu],
  ["mono", /\bmono\b/iu],
  ["stereo", /\bstereo\b/iu],
  ["deluxe", /\bdeluxe\b/iu],
  ["expanded", /\bexpanded\b/iu],
];

export interface NormalizedMetadata {
  original: string;
  comparable: string;
  versionTags: VersionTag[];
}

export function extractVersionTags(value: string): VersionTag[] {
  return VERSION_PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([tag]) => tag);
}

function stripDiacritics(value: string): string {
  return value.normalize("NFKD").replace(/\p{M}+/gu, "");
}

export function normalizeText(value: string): string {
  return stripDiacritics(value.normalize("NFKC"))
    .toLocaleLowerCase("en-US")
    .replace(/[‐‑‒–—―−]/gu, "-")
    .replace(/[（【\[]/gu, "(")
    .replace(/[）】\]]/gu, ")")
    .replace(/\b(?:featuring|feat|ft)\.?(?=\s|$)/giu, "feat")
    .replace(/[·•]/gu, " ")
    .replace(/[_/\\|,:;!?！？。，、'“”‘’]+/gu, " ")
    .replace(/[(){}]/gu, " ")
    .replace(/\s*-\s*/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

export function normalizeMetadata(value: string, kind: "title" | "artist" | "album"): NormalizedMetadata {
  let comparableSource = value;
  if (kind === "album") {
    comparableSource = comparableSource.replace(/\s*-\s*(?:single|ep)\s*$/iu, "");
  }

  for (const [, pattern] of VERSION_PATTERNS) {
    comparableSource = comparableSource.replace(pattern, " ");
  }

  return {
    original: value,
    comparable: normalizeText(comparableSource),
    versionTags: extractVersionTags(value),
  };
}

export function normalizeArtists(value: string | string[]): string[] {
  const source = Array.isArray(value) ? value : [value];
  return source
    .flatMap((artist) => artist.split(/\s*(?:,|&|×|、|\b(?:feat|ft)\.?\s+|\bfeaturing\s+)\s*/iu))
    .map(normalizeText)
    .filter(Boolean);
}
