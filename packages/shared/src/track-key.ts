import type { TrackQuery } from "./domain";
import { normalizeMetadata } from "./normalize";

export function canonicalTrackKeyInput(track: TrackQuery): string {
  if (track.appleMusicId?.trim()) return `apple:${track.appleMusicId.trim()}`;
  const roundedDuration = track.durationMs ? Math.round(track.durationMs / 5_000) * 5_000 : 0;
  return [
    normalizeMetadata(track.title, "title").comparable,
    normalizeMetadata(track.artist, "artist").comparable,
    normalizeMetadata(track.album, "album").comparable,
    roundedDuration,
  ].join("\u001f");
}

export async function createTrackKey(track: TrackQuery): Promise<string> {
  const canonical = canonicalTrackKeyInput(track);
  if (canonical.startsWith("apple:")) return canonical;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical));
  return `sha256:${[...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}
