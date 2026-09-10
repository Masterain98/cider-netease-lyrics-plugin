import { v3 } from "@ciderapp/pluginkit";
import type { TrackQuery } from "@cider-netease/shared";
import { readCurrentMediaItem } from "../adapters/cider-track-adapter";

type UnknownRecord = Record<string, unknown>;

export interface TrackMetadata {
  title?: string;
  artist?: string;
  album?: string;
  composer?: string;
  genres?: string[];
  releaseDate?: string;
  trackNumber?: number;
  discNumber?: number;
  durationMs?: number;
  isrc?: string;
  appleMusicId?: string;
  contentRating?: string;
  hasLyrics?: boolean;
  url?: string;
  audioTraits?: string[];
}

export type TrackMetadataFetcher = (appleMusicId: string) => Promise<unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? value as UnknownRecord : {};
}

function firstString(...values: unknown[]): string | undefined {
  return values.find((value): value is string => typeof value === "string" && value.trim().length > 0)?.trim();
}

function stringList(...values: unknown[]): string[] | undefined {
  const result = values.flatMap((value) => Array.isArray(value) ? value : [value])
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .map((value) => value.trim());
  return result.length ? [...new Set(result)] : undefined;
}

function relationshipNames(value: unknown): string[] | undefined {
  const relationship = record(value);
  const entries = Array.isArray(relationship.data) ? relationship.data : relationship.data ? [relationship.data] : [];
  return stringList(entries.map((entry) => {
    const resource = record(entry);
    const attributes = record(resource.attributes);
    return firstString(attributes.name, attributes.artistName, resource.name, resource.artistName);
  }));
}

function positiveNumber(...values: unknown[]): number | undefined {
  return values.find((value): value is number => typeof value === "number" && Number.isFinite(value) && value > 0);
}

function booleanValue(...values: unknown[]): boolean | undefined {
  return values.find((value): value is boolean => typeof value === "boolean");
}

function normalizeIsrc(value: unknown): string | undefined {
  const raw = firstString(value)?.replace(/-/gu, "").toLocaleUpperCase("en-US");
  return raw && /^[A-Z]{2}[A-Z0-9]{3}\d{7}$/u.test(raw) ? raw : undefined;
}

function resourceFromResponse(value: unknown): unknown {
  const response = record(value);
  const data = record(response.data);
  const payload = data.data;
  return Array.isArray(payload) ? payload[0] : payload;
}

export function metadataFromMediaItem(item: unknown, fallback?: TrackQuery | null): TrackMetadata {
  const media = record(item);
  const attributes = record(media.attributes);
  const playParams = record(attributes.playParams ?? media.playParams);
  const relationships = record(media.relationships);
  const album = record(relationships.albums);
  const albumData = Array.isArray(album.data) ? record(album.data[0]) : record(album.data);
  const albumAttributes = record(albumData.attributes);
  const durationInMillis = positiveNumber(attributes.durationInMillis, media.durationInMillis);
  const playbackDuration = positiveNumber(attributes.playbackDuration, media.playbackDuration);
  const durationMs = durationInMillis ?? (playbackDuration
    ? (playbackDuration < 86_400 ? playbackDuration * 1_000 : playbackDuration)
    : undefined);
  const genres = stringList(attributes.genreNames, media.genreNames, attributes.genres, media.genres, relationshipNames(relationships.genres));
  const composer = firstString(attributes.composerName, media.composerName, relationshipNames(relationships.composers)?.join(" · "));
  const appleMusicId = firstString(media.id, attributes.id, playParams.catalogId, playParams.id, fallback?.appleMusicId);

  const result: TrackMetadata = {};
  const title = firstString(attributes.name, attributes.title, media.title, media.name, fallback?.title);
  const artist = firstString(attributes.artistName, media.artistName, attributes.artist, media.artist, fallback?.artist);
  const albumName = firstString(attributes.albumName, media.albumName, attributes.album, media.album, albumAttributes.name, fallback?.album);
  const releaseDate = firstString(attributes.releaseDate, media.releaseDate, albumAttributes.releaseDate);
  const trackNumber = positiveNumber(attributes.trackNumber, media.trackNumber);
  const discNumber = positiveNumber(attributes.discNumber, media.discNumber);
  const isrc = normalizeIsrc(attributes.isrc ?? media.isrc) ?? fallback?.isrc;
  const contentRating = firstString(attributes.contentRating, media.contentRating);
  const hasLyrics = booleanValue(attributes.hasLyrics, media.hasLyrics);
  const url = firstString(attributes.url, media.url);
  const audioTraits = stringList(attributes.audioTraits, media.audioTraits);
  if (title) result.title = title;
  if (artist) result.artist = artist;
  if (albumName) result.album = albumName;
  if (composer) result.composer = composer;
  if (genres) result.genres = genres;
  if (releaseDate) result.releaseDate = releaseDate;
  if (trackNumber) result.trackNumber = trackNumber;
  if (discNumber) result.discNumber = discNumber;
  if (durationMs) result.durationMs = Math.round(durationMs);
  else if (fallback?.durationMs) result.durationMs = Math.round(fallback.durationMs);
  if (isrc) result.isrc = isrc;
  if (appleMusicId) result.appleMusicId = appleMusicId;
  if (contentRating) result.contentRating = contentRating;
  if (hasLyrics !== undefined) result.hasLyrics = hasLyrics;
  if (url) result.url = url;
  if (audioTraits) result.audioTraits = audioTraits;
  return result;
}

export function mergeTrackMetadata(base: TrackMetadata, extra: TrackMetadata): TrackMetadata {
  const result = { ...base, ...extra };
  if (!extra.genres?.length && base.genres?.length) result.genres = base.genres;
  if (!extra.audioTraits?.length && base.audioTraits?.length) result.audioTraits = base.audioTraits;
  return result;
}

export async function fetchCatalogSong(appleMusicId: string): Promise<unknown> {
  const response = await v3<unknown>(`/v1/catalog/$STOREFRONT/songs/${encodeURIComponent(appleMusicId)}`, {
    include: "audio-analysis,genres,artists,albums,library,lyrics,credits",
    extend: "editorialArtwork,editorialVideo,lyricsExcerpt,inFavorites,centeredFullscreenBackground,artistBio,bornOrFormed,isGroup,origin,hero",
  });
  const resource = resourceFromResponse(response);
  if (!resource) throw new Error("Cider returned no metadata for this song");
  return resource;
}

export class TrackMetadataService {
  private readonly cache = new Map<string, TrackMetadata>();
  private readonly pending = new Map<string, Promise<TrackMetadata>>();

  constructor(private readonly fetcher: TrackMetadataFetcher = fetchCatalogSong) {}

  snapshot(track: TrackQuery | null): TrackMetadata {
    return metadataFromMediaItem(readCurrentMediaItem(), track);
  }

  async load(track: TrackQuery | null): Promise<TrackMetadata> {
    const base = this.snapshot(track);
    const id = track?.appleMusicId ?? base.appleMusicId;
    if (!id) return base;
    const cached = this.cache.get(id);
    if (cached) return mergeTrackMetadata(base, cached);
    const existing = this.pending.get(id);
    if (existing) return mergeTrackMetadata(base, await existing);
    const request = this.fetcher(id)
      .then((resource) => {
        const metadata = metadataFromMediaItem(resource, track);
        this.cache.set(id, metadata);
        return metadata;
      })
      .finally(() => this.pending.delete(id));
    this.pending.set(id, request);
    return mergeTrackMetadata(base, await request);
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }
}

export const trackMetadataService = new TrackMetadataService();
