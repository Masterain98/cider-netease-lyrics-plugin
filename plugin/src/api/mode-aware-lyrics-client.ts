import type { LyricsResponse, ResolveResponse, SearchResponse, TrackQuery } from "@cider-netease/shared";
import type { ConnectionMode } from "../stores/settings-store";
import type { LyricsClient } from "./lyrics-client";

export class ModeAwareLyricsClient implements LyricsClient {
  constructor(
    private readonly mode: () => ConnectionMode,
    private readonly direct: LyricsClient,
    private readonly gateway: LyricsClient,
  ) {}

  resolve(track: TrackQuery, signal?: AbortSignal, bypassCache = false): Promise<ResolveResponse> {
    return this.active().resolve(track, signal, bypassCache);
  }

  search(track: TrackQuery, query: string | undefined, signal?: AbortSignal, bypassCache = false): Promise<SearchResponse> {
    return this.active().search(track, query, signal, bypassCache);
  }

  lyrics(neteaseId: string, durationMs?: number, signal?: AbortSignal, bypassCache = false): Promise<LyricsResponse> {
    return this.active().lyrics(neteaseId, durationMs, signal, bypassCache);
  }

  private active(): LyricsClient {
    return this.mode() === "gateway" ? this.gateway : this.direct;
  }
}
