import type { LyricsResponse, ResolveResponse, SearchResponse, TrackQuery } from "@cider-netease/shared";

export interface LyricsClient {
  resolve(track: TrackQuery, signal?: AbortSignal, bypassCache?: boolean): Promise<ResolveResponse>;
  search(track: TrackQuery, query: string | undefined, signal?: AbortSignal, bypassCache?: boolean): Promise<SearchResponse>;
  lyrics(neteaseId: string, durationMs?: number, signal?: AbortSignal, bypassCache?: boolean): Promise<LyricsResponse>;
}
