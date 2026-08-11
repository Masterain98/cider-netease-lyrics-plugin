import { createRequire } from "node:module";
import {
  extractNeteaseLyrics,
  normalizeNeteaseSearchCandidates,
  type RawNeteaseLyrics,
  type RawTrackCandidate,
} from "@cider-netease/shared";
import type { GatewayConfig } from "../config";
import { GatewayError } from "../errors";
import { CircuitBreaker } from "../infrastructure/circuit-breaker";
import { TtlCache } from "../infrastructure/ttl-cache";
import { withTimeout } from "../infrastructure/timeout";
import type { ApiResponse, NeteasePort } from "./types";

export interface NeteaseApi {
  cloudsearch(input: { keywords: string; type: number; limit: number; offset: number }): Promise<ApiResponse>;
  lyric(input: { id: string }): Promise<ApiResponse>;
}

const require = createRequire(import.meta.url);
const api = require("@neteasecloudmusicapienhanced/api") as NeteaseApi;

export class NeteaseClient implements NeteasePort {
  private readonly searchCache = new TtlCache<RawTrackCandidate[]>(500);
  private readonly lyricsCache = new TtlCache<RawNeteaseLyrics>(1_000);
  private readonly breaker: CircuitBreaker;

  constructor(
    private readonly config: GatewayConfig,
    private readonly apiClient: NeteaseApi = api,
  ) {
    this.breaker = new CircuitBreaker(config.circuitFailureThreshold, config.circuitResetMs);
  }

  async search(keywords: string, limit: number, bypassCache = false): Promise<RawTrackCandidate[]> {
    const key = `${keywords.normalize("NFKC").toLocaleLowerCase("en-US")}:${limit}`;
    const cached = bypassCache ? undefined : this.searchCache.get(key);
    if (cached) return cached;
    const response = await this.call(() => this.apiClient.cloudsearch({ keywords, type: 1, limit, offset: 0 }));
    const parsed = normalizeNeteaseSearchCandidates(response.body);
    this.searchCache.set(key, parsed, this.config.searchCacheTtlMs);
    return parsed;
  }

  async lyrics(neteaseId: string, bypassCache = false): Promise<RawNeteaseLyrics> {
    const cached = bypassCache ? undefined : this.lyricsCache.get(neteaseId);
    if (cached) return cached;
    const response = await this.call(() => this.apiClient.lyric({ id: neteaseId }));
    const parsed = extractNeteaseLyrics(response.body);
    this.lyricsCache.set(neteaseId, parsed, this.config.lyricsCacheTtlMs);
    return parsed;
  }

  private async call(operation: () => Promise<ApiResponse>): Promise<ApiResponse> {
    return this.breaker.run(async () => {
      let lastError: unknown;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          const response = await withTimeout(operation(), this.config.upstreamTimeoutMs, "NetEase did not respond in time.");
          if (response.status >= 500) throw new GatewayError("UPSTREAM_UNAVAILABLE", "NetEase returned a temporary error.", 503);
          if (response.status < 200 || response.status >= 300) {
            throw new GatewayError("UPSTREAM_UNAVAILABLE", "NetEase rejected the request.", 502);
          }
          return response;
        } catch (error) {
          lastError = error;
          if (error instanceof GatewayError && error.code !== "TIMEOUT" && error.status < 500) throw error;
        }
      }
      if (lastError instanceof GatewayError) throw lastError;
      throw new GatewayError("UPSTREAM_UNAVAILABLE", "NetEase is unavailable.", 503);
    });
  }
}
