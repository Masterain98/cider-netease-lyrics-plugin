import { SCHEMA_VERSION, type MatchSelection, type ScoreBreakdown, type SearchResponse, type TrackCandidate, type TrackQuery, type VersionTag } from "./domain";
import { normalizeArtists, normalizeMetadata } from "./normalize";
import { textSimilarity } from "./similarity";

export interface RawTrackCandidate {
  neteaseId: string;
  title: string;
  artists: string[];
  album: string;
  durationMs?: number | undefined;
  aliases?: string[] | undefined;
}

const SEVERE_VERSION_TAGS = new Set<VersionTag>(["live", "acoustic", "instrumental", "demo", "radio-edit", "karaoke"]);

function roundScore(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 10_000) / 10_000;
}

function durationSimilarity(expected?: number, actual?: number): number {
  if (!expected || !actual) return 0.5;
  const difference = Math.abs(expected - actual);
  if (difference <= 2_000) return 1;
  const tolerance = Math.max(8_000, expected * 0.04);
  if (difference >= tolerance * 2) return 0;
  return Math.max(0, 1 - (difference - 2_000) / (tolerance * 2 - 2_000));
}

function artistSimilarity(expected: string, actual: string[]): number {
  const left = normalizeArtists(expected);
  const right = normalizeArtists(actual);
  if (left.length === 0 || right.length === 0) return 0;
  const directional = (source: string[], target: string[]) =>
    source.reduce((sum, artist) => sum + Math.max(...target.map((other) => textSimilarity(artist, other))), 0) / source.length;
  return (directional(left, right) + directional(right, left)) / 2;
}

function versionConflict(expected: VersionTag[], actual: VersionTag[]): { penalty: number; severe: boolean } {
  const expectedSet = new Set(expected);
  const actualSet = new Set(actual);
  const mismatches = new Set([...expected.filter((tag) => !actualSet.has(tag)), ...actual.filter((tag) => !expectedSet.has(tag))]);
  const severe = [...mismatches].some((tag) => SEVERE_VERSION_TAGS.has(tag));
  const penalty = [...mismatches].reduce((sum, tag) => sum + (SEVERE_VERSION_TAGS.has(tag) ? 0.22 : 0.08), 0);
  return { penalty: Math.min(0.5, penalty), severe };
}

export function scoreCandidate(query: TrackQuery, raw: RawTrackCandidate): TrackCandidate {
  const queryTitle = normalizeMetadata(query.title, "title");
  const queryAlbum = normalizeMetadata(query.album, "album");
  const candidateTitle = normalizeMetadata(raw.title, "title");
  const candidateAlbum = normalizeMetadata(raw.album, "album");
  const titleScore = textSimilarity(queryTitle.comparable, candidateTitle.comparable);
  const albumScore = queryAlbum.comparable ? textSimilarity(queryAlbum.comparable, candidateAlbum.comparable) : 0.5;
  const artistScore = artistSimilarity(query.artist, raw.artists);
  const durationScore = durationSimilarity(query.durationMs, raw.durationMs);
  const versions = versionConflict(queryTitle.versionTags, candidateTitle.versionTags);
  const breakdown: ScoreBreakdown = {
    title: roundScore(titleScore * 0.45),
    album: roundScore(albumScore * 0.25),
    artist: roundScore(artistScore * 0.2),
    duration: roundScore(durationScore * 0.1),
    versionPenalty: roundScore(versions.penalty),
  };
  const score = roundScore(breakdown.title + breakdown.album + breakdown.artist + breakdown.duration - breakdown.versionPenalty);

  return {
    ...raw,
    score,
    scoreBreakdown: breakdown,
    versionTags: candidateTitle.versionTags,
    severeVersionConflict: versions.severe,
  };
}

export interface SelectionThresholds {
  autoScore: number;
  minimumScore: number;
  autoMargin: number;
}

export const DEFAULT_SELECTION_THRESHOLDS: SelectionThresholds = {
  autoScore: 0.88,
  minimumScore: 0.55,
  autoMargin: 0.08,
};

export function selectCandidate(
  candidates: TrackCandidate[],
  thresholds: SelectionThresholds = DEFAULT_SELECTION_THRESHOLDS,
): MatchSelection {
  const ranked = [...candidates].sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < thresholds.minimumScore) {
    return { decision: "none", candidates: ranked, reason: "No candidate reached the minimum confidence threshold." };
  }
  const runnerUp = ranked[1];
  const margin = best.score - (runnerUp?.score ?? 0);
  if (!best.severeVersionConflict && best.score >= thresholds.autoScore && margin >= thresholds.autoMargin) {
    return { decision: "auto", selected: best, candidates: ranked, reason: "The best candidate is high-confidence and clearly ahead." };
  }
  return {
    decision: "manual",
    candidates: ranked,
    reason: best.severeVersionConflict
      ? "The leading candidate has a conflicting version marker."
      : "The leading candidates are too close or below the automatic-selection threshold.",
  };
}

export function buildSearchQueries(track: TrackQuery): string[] {
  const title = track.title.trim();
  const artist = track.artist.trim();
  const album = track.album.trim().replace(/\s*-\s*(?:Single|EP)\s*$/iu, "");
  const normalizedTitle = normalizeMetadata(title, "title").comparable;
  return [...new Set([`${title} ${artist}`.trim(), `${title} ${album}`.trim(), normalizedTitle].filter(Boolean))];
}

export function buildRankedSearchResponse(
  track: TrackQuery,
  queries: string[],
  batches: RawTrackCandidate[][],
): SearchResponse {
  const deduplicated = new Map<string, TrackCandidate>();
  for (const raw of batches.flat()) {
    const scored = scoreCandidate(track, raw);
    const existing = deduplicated.get(scored.neteaseId);
    if (!existing || scored.score > existing.score) deduplicated.set(scored.neteaseId, scored);
  }
  return {
    schemaVersion: SCHEMA_VERSION,
    queries,
    candidates: [...deduplicated.values()].sort((left, right) => right.score - left.score).slice(0, 20),
  };
}
