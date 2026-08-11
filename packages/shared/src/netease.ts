import type { RawTrackCandidate } from "./matching";
import type { RawNeteaseLyrics } from "./lyrics";

interface NeteaseSongLike {
  id?: string | number;
  name?: string;
  ar?: Array<{ name?: string }>;
  artists?: Array<{ name?: string }>;
  al?: { name?: string };
  album?: { name?: string };
  dt?: number;
  duration?: number;
  alia?: string[];
  alias?: string[];
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : undefined;
}

function lyricText(body: Record<string, unknown>, key: string): string | undefined {
  const lyric = record(body[key])?.lyric;
  return typeof lyric === "string" ? lyric : undefined;
}

export function isNeteaseSearchEnvelope(value: unknown): boolean {
  const body = record(value);
  const result = record(body?.result);
  if (!body || !result) return false;
  return result.songs === undefined || Array.isArray(result.songs);
}

export function isNeteaseLyricsEnvelope(value: unknown): boolean {
  const body = record(value);
  if (!body) return false;
  return ["lrc", "tlyric", "romalrc", "yrc"].some((key) => record(body[key]) !== undefined)
    || body.nolyric === true
    || body.uncollected === true;
}

export function normalizeNeteaseSong(value: unknown): RawTrackCandidate | null {
  const song = record(value) as NeteaseSongLike | undefined;
  if (!song || song.id === undefined || typeof song.name !== "string" || !song.name.trim()) return null;
  const artists = (song.ar ?? song.artists ?? [])
    .map((artist) => artist.name?.trim())
    .filter((name): name is string => Boolean(name));
  const album = (song.al ?? song.album)?.name?.trim() ?? "";
  const durationMs = song.dt ?? song.duration;
  const aliases = song.alia ?? song.alias;
  return {
    neteaseId: String(song.id),
    title: song.name,
    artists,
    album,
    ...(typeof durationMs === "number" && Number.isFinite(durationMs) ? { durationMs } : {}),
    ...(Array.isArray(aliases) && aliases.length ? { aliases: aliases.filter((alias) => typeof alias === "string") } : {}),
  };
}

export function normalizeNeteaseSearchCandidates(value: unknown): RawTrackCandidate[] {
  const songs = record(record(value)?.result)?.songs;
  if (!Array.isArray(songs)) return [];
  return songs.map(normalizeNeteaseSong).filter((song): song is RawTrackCandidate => song !== null);
}

export function extractNeteaseLyrics(value: unknown): RawNeteaseLyrics {
  const body = record(value) ?? {};
  return {
    ...(lyricText(body, "lrc") !== undefined ? { lrc: lyricText(body, "lrc") } : {}),
    ...(lyricText(body, "tlyric") !== undefined ? { tlyric: lyricText(body, "tlyric") } : {}),
    ...(lyricText(body, "romalrc") !== undefined ? { romalrc: lyricText(body, "romalrc") } : {}),
    ...(lyricText(body, "yrc") !== undefined ? { yrc: lyricText(body, "yrc") } : {}),
  };
}
