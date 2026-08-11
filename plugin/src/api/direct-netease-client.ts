import {
  SCHEMA_VERSION,
  buildLyricResponse,
  buildRankedSearchResponse,
  buildSearchQueries,
  extractNeteaseLyrics,
  isNeteaseLyricsEnvelope,
  isNeteaseSearchEnvelope,
  normalizeNeteaseSearchCandidates,
  selectCandidate,
  type LyricsResponse,
  type RawNeteaseLyrics,
  type RawTrackCandidate,
  type ResolveResponse,
  type SearchResponse,
  type TrackQuery,
} from "@cider-netease/shared";
import { PluginError } from "../domain/errors";
import type { LyricsClient } from "./lyrics-client";

const SEARCH_ENDPOINT = "https://music.163.com/api/search/get";
const LYRICS_ENDPOINT = "https://music.163.com/api/song/lyric";
const SEARCH_TTL_MS = 10 * 60 * 1_000;
const LYRICS_TTL_MS = 60 * 60 * 1_000;

interface CacheEntry<T> {
  expiresAt: number;
  value: T;
}

export interface DirectConnectionProbe {
  status: "ok";
  endpoint: typeof SEARCH_ENDPOINT;
  candidateCount: number;
}

export class DirectNeteaseClient implements LyricsClient {
  private readonly searchCache = new Map<string, CacheEntry<RawTrackCandidate[]>>();
  private readonly lyricsCache = new Map<string, CacheEntry<RawNeteaseLyrics>>();

  constructor(private readonly timeoutMs: () => number) {}

  resolve(track: TrackQuery, signal?: AbortSignal, bypassCache = false): Promise<ResolveResponse> {
    return this.withDeadline(signal, async (operationSignal, deadline) => {
      const search = await this.searchAutomatically(track, operationSignal, deadline, bypassCache);
      const selection = selectCandidate(search.candidates);
      if (selection.decision === "none") {
        return {
          schemaVersion: SCHEMA_VERSION,
          state: "no-match",
          queries: search.queries,
          candidates: search.candidates,
          reason: selection.reason,
        };
      }
      if (selection.decision === "manual" || !selection.selected) {
        return {
          schemaVersion: SCHEMA_VERSION,
          state: "selecting-candidate",
          queries: search.queries,
          candidates: search.candidates,
          reason: selection.reason,
        };
      }
      const lyrics = await this.getLyrics(selection.selected.neteaseId, track.durationMs, operationSignal, deadline, bypassCache);
      if (!lyrics) {
        return {
          schemaVersion: SCHEMA_VERSION,
          state: "no-lyrics",
          queries: search.queries,
          match: selection.selected,
          candidates: search.candidates,
          reason: "The selected NetEase song has no line-synced lyrics.",
        };
      }
      return {
        schemaVersion: SCHEMA_VERSION,
        state: "ready",
        queries: search.queries,
        match: selection.selected,
        candidates: search.candidates,
        lyrics: lyrics.lyrics,
        lyricDiagnostics: lyrics.diagnostics,
        reason: selection.reason,
      };
    });
  }

  search(track: TrackQuery, query: string | undefined, signal?: AbortSignal, bypassCache = false): Promise<SearchResponse> {
    return this.withDeadline(signal, async (operationSignal, deadline) => {
      const queries = query?.trim() ? [query.trim()] : buildSearchQueries(track);
      const limit = query?.trim() ? 20 : 15;
      const batches = await Promise.all(queries.map((item) => this.searchQuery(item, limit, operationSignal, deadline, bypassCache)));
      return buildRankedSearchResponse(track, queries, batches);
    });
  }

  lyrics(neteaseId: string, durationMs?: number, signal?: AbortSignal, bypassCache = false): Promise<LyricsResponse> {
    return this.withDeadline(signal, async (operationSignal, deadline) => {
      const response = await this.getLyrics(neteaseId, durationMs, operationSignal, deadline, bypassCache);
      if (!response) throw new PluginError("NO_LYRICS", "NetEase Music has no usable line-synced lyrics for this song.");
      return response;
    });
  }

  probe(signal?: AbortSignal): Promise<DirectConnectionProbe> {
    return this.withDeadline(signal, async (operationSignal, deadline) => {
      const candidates = await this.searchQuery("Hello Adele", 1, operationSignal, deadline, true);
      return { status: "ok", endpoint: SEARCH_ENDPOINT, candidateCount: candidates.length };
    });
  }

  private async searchAutomatically(track: TrackQuery, signal: AbortSignal, deadline: number, bypassCache: boolean): Promise<SearchResponse> {
    const queries = buildSearchQueries(track);
    const batches = await Promise.all(queries.map((query) => this.searchQuery(query, 15, signal, deadline, bypassCache)));
    return buildRankedSearchResponse(track, queries, batches);
  }

  private async searchQuery(query: string, limit: number, signal: AbortSignal, deadline: number, bypassCache: boolean): Promise<RawTrackCandidate[]> {
    const key = `${query.trim().toLocaleLowerCase("en-US")}:${limit}`;
    const cached = this.readCache(this.searchCache, key, bypassCache);
    if (cached) return cached;
    const url = new URL(SEARCH_ENDPOINT);
    url.searchParams.set("s", query);
    url.searchParams.set("type", "1");
    url.searchParams.set("offset", "0");
    url.searchParams.set("total", "true");
    url.searchParams.set("limit", String(limit));
    const payload = await this.getJson(url, signal, deadline);
    if (!isNeteaseSearchEnvelope(payload)) {
      throw new PluginError("DIRECT_API_CHANGED", "The NetEase search API returned an unrecognized response. The API may have changed.");
    }
    const candidates = normalizeNeteaseSearchCandidates(payload);
    this.searchCache.set(key, { expiresAt: Date.now() + SEARCH_TTL_MS, value: candidates });
    return candidates;
  }

  private async getLyrics(
    neteaseId: string,
    durationMs: number | undefined,
    signal: AbortSignal,
    deadline: number,
    bypassCache: boolean,
  ): Promise<LyricsResponse | null> {
    let raw = this.readCache(this.lyricsCache, neteaseId, bypassCache);
    if (!raw) {
      const url = new URL(LYRICS_ENDPOINT);
      url.searchParams.set("id", neteaseId);
      url.searchParams.set("lv", "-1");
      url.searchParams.set("tv", "-1");
      url.searchParams.set("rv", "-1");
      url.searchParams.set("kv", "-1");
      url.searchParams.set("yv", "-1");
      const payload = await this.getJson(url, signal, deadline);
      if (!isNeteaseLyricsEnvelope(payload)) {
        throw new PluginError("DIRECT_API_CHANGED", "The NetEase lyrics API returned an unrecognized response. The API may have changed.");
      }
      raw = extractNeteaseLyrics(payload);
      this.lyricsCache.set(neteaseId, { expiresAt: Date.now() + LYRICS_TTL_MS, value: raw });
    }
    return buildLyricResponse(neteaseId, raw, durationMs);
  }

  private readCache<T>(cache: Map<string, CacheEntry<T>>, key: string, bypass: boolean): T | undefined {
    if (bypass) return undefined;
    const entry = cache.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      cache.delete(key);
      return undefined;
    }
    return entry.value;
  }

  private async getJson(url: URL, signal: AbortSignal, deadline: number): Promise<unknown> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(url.toString(), { method: "GET", signal });
        if (response.status === 403 || response.status === 451) {
          throw new PluginError("DIRECT_ACCESS_BLOCKED", `The direct NetEase API returned HTTP ${response.status}; access may be restricted by region or network policy.`);
        }
        if (response.status === 429) {
          throw new PluginError("RATE_LIMITED", "The direct NetEase API rate limit was reached.");
        }
        if (response.status >= 500) {
          if (attempt === 0 && !signal.aborted && Date.now() < deadline) continue;
          throw new PluginError("UPSTREAM_UNAVAILABLE", `The direct NetEase API is temporarily unavailable (HTTP ${response.status}).`);
        }
        if (!response.ok) {
          throw new PluginError("UPSTREAM_UNAVAILABLE", `The direct NetEase API returned HTTP ${response.status}.`);
        }
        const payload = await response.json().catch(() => {
          throw new PluginError("DIRECT_API_CHANGED", "The direct NetEase API returned invalid JSON. The API may have changed.");
        });
        const upstreamCode = this.upstreamCode(payload);
        if (upstreamCode === 403 || upstreamCode === 451) {
          throw new PluginError("DIRECT_ACCESS_BLOCKED", `The direct NetEase API returned code ${upstreamCode}; access may be restricted by region or network policy.`);
        }
        if (upstreamCode === 429) {
          throw new PluginError("RATE_LIMITED", "The direct NetEase API rate limit was reached.");
        }
        if (upstreamCode !== undefined && upstreamCode !== 200) {
          throw new PluginError("UPSTREAM_UNAVAILABLE", `The direct NetEase API returned code ${upstreamCode}.`);
        }
        return payload;
      } catch (error) {
        if (error instanceof PluginError) throw error;
        if (signal.aborted) throw error;
        if (attempt === 0 && Date.now() < deadline) continue;
        throw new PluginError("DIRECT_CONNECTION_FAILED", "Cider could not connect directly to NetEase. The browser cannot distinguish between network, DNS, TLS, and CORS failures.");
      }
    }
    throw new PluginError("DIRECT_CONNECTION_FAILED", "Cider could not connect directly to NetEase.");
  }

  private async withDeadline<T>(externalSignal: AbortSignal | undefined, operation: (signal: AbortSignal, deadline: number) => Promise<T>): Promise<T> {
    const controller = new AbortController();
    const abortFromCaller = () => controller.abort();
    externalSignal?.addEventListener("abort", abortFromCaller, { once: true });
    if (externalSignal?.aborted) controller.abort();
    const timeoutMs = Math.max(1_000, this.timeoutMs());
    const deadline = Date.now() + timeoutMs;
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await operation(controller.signal, deadline);
    } catch (error) {
      if (controller.signal.aborted) {
        if (externalSignal?.aborted) throw new DOMException("Request cancelled", "AbortError");
        throw new PluginError("TIMEOUT", "The direct NetEase request timed out.");
      }
      if (error instanceof PluginError) throw error;
      throw error;
    } finally {
      clearTimeout(timeout);
      controller.abort();
      externalSignal?.removeEventListener("abort", abortFromCaller);
    }
  }

  private upstreamCode(payload: unknown): number | undefined {
    if (!payload || typeof payload !== "object") return undefined;
    const code = (payload as { code?: unknown }).code;
    return typeof code === "number" ? code : undefined;
  }
}

export const DIRECT_SEARCH_ENDPOINT = SEARCH_ENDPOINT;
export const DIRECT_LYRICS_ENDPOINT = LYRICS_ENDPOINT;
