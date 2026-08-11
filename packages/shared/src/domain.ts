export const SCHEMA_VERSION = 1;

export interface TrackQuery {
  appleMusicId?: string | undefined;
  title: string;
  artist: string;
  album: string;
  durationMs?: number | undefined;
  isrc?: string | undefined;
}

export type VersionTag =
  | "live"
  | "remaster"
  | "acoustic"
  | "instrumental"
  | "demo"
  | "radio-edit"
  | "karaoke"
  | "mono"
  | "stereo"
  | "deluxe"
  | "expanded";

export interface ScoreBreakdown {
  title: number;
  artist: number;
  album: number;
  duration: number;
  versionPenalty: number;
}

export interface TrackCandidate {
  neteaseId: string;
  title: string;
  artists: string[];
  album: string;
  durationMs?: number | undefined;
  aliases?: string[] | undefined;
  score: number;
  scoreBreakdown: ScoreBreakdown;
  versionTags: VersionTag[];
  severeVersionConflict: boolean;
}

export type LyricTiming = "Line" | "Word" | "None";

export interface LyricLine {
  start: number;
  end: number;
  text: string;
  translation?: string;
  words: LyricLine[];
  empty: boolean;
  isDuet?: boolean;
  index?: number;
  isCredit?: boolean;
}

export interface LyricProviderResult {
  type: LyricTiming;
  lyrics: LyricLine[];
  source: "NetEase";
  neteaseId: string;
}

export interface LyricFields {
  lrc: boolean;
  tlyric: boolean;
  romalrc: boolean;
  yrc: boolean;
}

export interface LyricDiagnostics {
  fields: LyricFields;
  unmatchedTranslations: Array<{ start: number; text: string }>;
  translationCjkRatio: number;
  translationIsChinese: boolean;
  parsedRomanizationLines: number;
}

export interface LyricsResponse {
  schemaVersion: number;
  lyrics: LyricProviderResult;
  diagnostics: LyricDiagnostics;
}

export type MatchDecision = "auto" | "manual" | "none";

export interface MatchSelection {
  decision: MatchDecision;
  selected?: TrackCandidate;
  candidates: TrackCandidate[];
  reason: string;
}

export interface SearchResponse {
  schemaVersion: number;
  queries: string[];
  candidates: TrackCandidate[];
}

export interface ResolveResponse {
  schemaVersion: number;
  state: "ready" | "selecting-candidate" | "no-match" | "no-lyrics";
  queries: string[];
  match?: TrackCandidate;
  candidates: TrackCandidate[];
  lyrics?: LyricProviderResult;
  lyricDiagnostics?: LyricDiagnostics;
  reason: string;
}

export type LyricsErrorCode =
  | "INVALID_REQUEST"
  | "NO_MATCH"
  | "NO_LYRICS"
  | "TIMEOUT"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "SERVICE_ERROR";

export interface ApiErrorResponse {
  schemaVersion: number;
  error: {
    code: LyricsErrorCode;
    message: string;
    requestId?: string;
    retryAfterSeconds?: number;
  };
}

export type RequestState =
  | "idle"
  | "resolving-track"
  | "searching"
  | "selecting-candidate"
  | "fetching-lyrics"
  | "ready"
  | "no-match"
  | "no-lyrics"
  | "timeout"
  | "rate-limited"
  | "service-error"
  | "cancelled";
