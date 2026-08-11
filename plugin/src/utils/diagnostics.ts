import type { LyricFields, TrackCandidate, TrackQuery } from "@cider-netease/shared";
import type { ConnectionMode } from "../stores/settings-store";

export interface RuntimeDiagnostics {
  connectionMode: ConnectionMode;
  upstreamType: "netease-direct" | "custom-gateway";
  requestTarget: string;
  connectionProbe?: string;
  track?: TrackQuery;
  trackKey?: string;
  searchQueries: string[];
  candidates: TrackCandidate[];
  selectedNeteaseId?: string;
  lyricFields?: LyricFields;
  requestDurationMs?: number;
  cache: "hit" | "miss" | "bypassed" | "none";
  lastErrorCode?: string;
  trackSourceProbe?: string;
  providerProbe?: string;
  simpleLyricViewProbe?: string;
}

export function emptyDiagnostics(): RuntimeDiagnostics {
  return {
    connectionMode: "direct",
    upstreamType: "netease-direct",
    requestTarget: "https://music.163.com",
    searchQueries: [],
    candidates: [],
    cache: "none",
  };
}
