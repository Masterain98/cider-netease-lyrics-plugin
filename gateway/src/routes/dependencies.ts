import type { TrackQuery } from "@cider-netease/shared";
import type { GatewayConfig } from "../config";
import { RequestCoalescer } from "../infrastructure/coalescer";
import { LyricService } from "../lyrics/service";
import { MatchService } from "../matching/service";

export interface RouteDependencies {
  config: GatewayConfig;
  matchService: MatchService;
  lyricService: LyricService;
  coalescer: RequestCoalescer;
  trackKey(track: TrackQuery): Promise<string>;
  enforceKeyRate(key: string): void;
}
