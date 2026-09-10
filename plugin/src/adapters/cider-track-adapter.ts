import { AppleMusic } from "@ciderapp/pluginkit";
import { normalizeText, type TrackQuery } from "@cider-netease/shared";
import { watch, type WatchStopHandle } from "vue";
import { getFallbackNowPlayingItem } from "./cider-host-access";
import { getHostAudioElement } from "./playback-adapter";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function finiteNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
}

export function readCurrentMediaItem(): unknown {
  try {
    return AppleMusic.nowPlayingItem;
  } catch {
    return getFallbackNowPlayingItem();
  }
}

export function trackQueryFromMediaItem(item: unknown): TrackQuery | null {
  const media = record(item);
  const attributes = record(media.attributes);
  const playParams = record(attributes.playParams ?? media.playParams);
  const title = firstString(attributes.name, attributes.title, media.title, media.name);
  const artist = firstString(attributes.artistName, media.artistName, attributes.artist, media.artist);
  const album = firstString(attributes.albumName, media.albumName, attributes.album, media.album) ?? "";
  if (!title || !artist) return null;
  const durationInMillis = finiteNumber(attributes.durationInMillis, media.durationInMillis);
  const playbackDuration = finiteNumber(attributes.playbackDuration, media.playbackDuration);
  const durationMs = durationInMillis ?? (playbackDuration ? (playbackDuration < 86_400 ? playbackDuration * 1_000 : playbackDuration) : undefined);
  const appleMusicId = firstString(media.id, attributes.id, playParams.catalogId, playParams.id);
  const rawIsrc = firstString(attributes.isrc, media.isrc)?.replace(/-/gu, "").toLocaleUpperCase("en-US");
  const isrc = rawIsrc && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/u.test(rawIsrc) ? rawIsrc : undefined;
  return {
    title,
    artist,
    album,
    ...(appleMusicId ? { appleMusicId } : {}),
    ...(durationMs ? { durationMs: Math.round(durationMs) } : {}),
    ...(isrc ? { isrc } : {}),
  };
}

export function quickTrackIdentity(track: TrackQuery | null): string {
  if (!track) return "none";
  if (track.appleMusicId) return `apple:${track.appleMusicId}`;
  return [normalizeText(track.title), normalizeText(track.artist), normalizeText(track.album), Math.round((track.durationMs ?? 0) / 5_000)].join("|");
}

export class CiderTrackAdapter {
  private watchStop: WatchStopHandle | undefined;
  private pollTimer: ReturnType<typeof setInterval> | undefined;
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;
  private lastIdentity = "__initial__";
  private audio: HTMLAudioElement | undefined;
  private readonly audioHandler = () => this.scheduleCheck();

  constructor(private readonly onTrack: (track: TrackQuery | null) => void) {}

  start(): void {
    if (this.pollTimer) return;
    this.watchStop = watch(
      () => this.readItem(),
      () => this.scheduleCheck(),
      { immediate: true },
    );
    this.audio = getHostAudioElement() ?? undefined;
    this.audio?.addEventListener("loadedmetadata", this.audioHandler);
    this.audio?.addEventListener("durationchange", this.audioHandler);
    this.pollTimer = setInterval(() => this.check(), 1_000);
  }

  stop(): void {
    this.watchStop?.();
    this.watchStop = undefined;
    if (this.pollTimer) clearInterval(this.pollTimer);
    this.pollTimer = undefined;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = undefined;
    this.audio?.removeEventListener("loadedmetadata", this.audioHandler);
    this.audio?.removeEventListener("durationchange", this.audioHandler);
    this.audio = undefined;
  }

  current(): TrackQuery | null {
    return trackQueryFromMediaItem(this.readItem());
  }

  private readItem(): unknown {
    return readCurrentMediaItem();
  }

  private scheduleCheck(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.check(), 150);
  }

  private check(): void {
    const track = this.current();
    const identity = quickTrackIdentity(track);
    if (identity === this.lastIdentity) return;
    this.lastIdentity = identity;
    this.onTrack(track);
  }
}
