import type { RawNeteaseLyrics, RawTrackCandidate } from "@cider-netease/shared";

export interface NeteasePort {
  search(keywords: string, limit: number, bypassCache?: boolean): Promise<RawTrackCandidate[]>;
  lyrics(neteaseId: string, bypassCache?: boolean): Promise<RawNeteaseLyrics>;
}

export interface ApiResponse {
  status: number;
  body: Record<string, unknown>;
}
