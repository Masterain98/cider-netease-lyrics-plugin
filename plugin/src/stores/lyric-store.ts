import {
  SCHEMA_VERSION,
  createTrackKey,
  type LyricDiagnostics,
  type LyricProviderResult,
  type LyricsResponse,
  type RequestState,
  type TrackCandidate,
  type TrackQuery,
} from "@cider-netease/shared";
import { reactive, watch, type WatchStopHandle } from "vue";
import { CiderTrackAdapter } from "../adapters/cider-track-adapter";
import { probeHostCapabilities } from "../adapters/native-provider-probe";
import { DirectNeteaseClient } from "../api/direct-netease-client";
import { LyricsGatewayClient } from "../api/lyrics-gateway-client";
import type { LyricsClient } from "../api/lyrics-client";
import { ModeAwareLyricsClient } from "../api/mode-aware-lyrics-client";
import { PluginError } from "../domain/errors";
import { emptyDiagnostics, type RuntimeDiagnostics } from "../utils/diagnostics";
import { MappingStore } from "./mapping-store";
import { settings } from "./settings-store";

export interface LyricRuntimeState {
  source: "netease" | "apple-music";
  status: RequestState;
  track: TrackQuery | null;
  trackKey: string | null;
  lyrics: LyricProviderResult | null;
  lyricDiagnostics: LyricDiagnostics | null;
  candidates: TrackCandidate[];
  errorMessage: string | null;
  diagnostics: RuntimeDiagnostics;
}

export const lyricState = reactive<LyricRuntimeState>({
  source: "netease",
  status: "idle",
  track: null,
  trackKey: null,
  lyrics: null,
  lyricDiagnostics: null,
  candidates: [],
  errorMessage: null,
  diagnostics: emptyDiagnostics(),
});

interface StoragePort {
  getMapping: MappingStore["getMapping"];
  saveMapping: MappingStore["saveMapping"];
  deleteMapping: MappingStore["deleteMapping"];
  getLyrics: MappingStore["getLyrics"];
  saveLyrics: MappingStore["saveLyrics"];
  getFailure: MappingStore["getFailure"];
  saveFailure: MappingStore["saveFailure"];
  clearFailure: MappingStore["clearFailure"];
}

interface TrackMonitor {
  start(): void;
  stop(): void;
}

export interface LyricControllerOptions {
  storage?: StoragePort;
  client?: LyricsClient;
  trackAdapter?: TrackMonitor;
}

export class LyricController {
  private readonly storage: StoragePort;
  private readonly client: LyricsClient;
  private readonly trackAdapter: TrackMonitor;
  private request: AbortController | undefined;
  private generation = 0;
  private started = false;
  private settingsWatch: WatchStopHandle | undefined;

  constructor(options: LyricControllerOptions = {}) {
    this.storage = options.storage ?? new MappingStore();
    this.client = options.client ?? new ModeAwareLyricsClient(
      () => settings.connectionMode,
      new DirectNeteaseClient(() => settings.requestTimeoutMs),
      new LyricsGatewayClient(() => settings.gatewayUrl, () => settings.requestTimeoutMs),
    );
    this.trackAdapter = options.trackAdapter ?? new CiderTrackAdapter((track) => void this.processTrack(track));
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.updateConnectionDiagnostics();
    const probe = probeHostCapabilities();
    lyricState.diagnostics.trackSourceProbe = probe.trackSource === "pluginkit-apple-music"
      ? "PluginKit AppleMusic store."
      : probe.trackSource === "guarded-cider-player"
        ? "Guarded Cider player fallback; public PluginKit store was not initialized by this host build."
        : "Unavailable.";
    lyricState.diagnostics.providerProbe = probe.nativeProviderAvailable
      ? "Detected but intentionally disabled until Cider confirms Marketplace support."
      : "Not exposed by this Cider host.";
    lyricState.diagnostics.simpleLyricViewProbe = probe.simpleLyricViewRegistered
      ? `Registered; XML property ${probe.simpleLyricViewAcceptsXmlProperty ? "accepted" : "not accepted"}. Custom Vue renderer selected for bilingual behavior.`
      : "Not registered. Custom Vue renderer selected.";
    if (!probe.appleMusicStoreAvailable) {
      lyricState.status = "service-error";
      lyricState.diagnostics.lastErrorCode = "INCOMPATIBLE_HOST";
      lyricState.errorMessage = null;
      return;
    }
    this.trackAdapter.start();
    this.settingsWatch = watch(
      [() => settings.autoMatch, () => settings.connectionMode],
      ([enabled, mode], [previousEnabled, previousMode]) => {
        if (mode !== previousMode) {
          this.updateConnectionDiagnostics();
          lyricState.diagnostics.connectionProbe = "Connection mode changed; the current track request was restarted without cache.";
          if (lyricState.track) void this.processTrack(lyricState.track, true);
          return;
        }
        if (enabled && lyricState.track && lyricState.status === "idle") void this.processTrack(lyricState.track, true);
        if (!enabled && previousEnabled) this.cancel("idle");
      },
    );
  }

  stop(): void {
    this.started = false;
    this.request?.abort();
    this.trackAdapter.stop();
    this.settingsWatch?.();
    this.settingsWatch = undefined;
  }

  async retry(): Promise<void> {
    if (!lyricState.track) return;
    if (lyricState.trackKey) await this.storage.clearFailure(lyricState.trackKey);
    await this.processTrack(lyricState.track, true);
  }

  async rematch(): Promise<void> {
    if (!lyricState.track || !lyricState.trackKey) return;
    await this.storage.deleteMapping(lyricState.trackKey);
    await this.storage.clearFailure(lyricState.trackKey);
    await this.processTrack(lyricState.track, true);
  }

  async customSearch(metadata: Pick<TrackQuery, "title" | "artist" | "album">): Promise<void> {
    const currentTrack = lyricState.track;
    if (!currentTrack) return;
    const customTrack: TrackQuery = {
      ...currentTrack,
      title: metadata.title.trim(),
      artist: metadata.artist.trim(),
      album: metadata.album.trim(),
    };
    const { signal, generation } = this.begin("searching");
    const startedAt = performance.now();
    lyricState.source = "netease";
    try {
      const response = await this.client.search(customTrack, undefined, signal, true);
      if (!this.isCurrent(generation)) return;
      lyricState.candidates = response.candidates;
      lyricState.diagnostics.searchQueries = response.queries;
      lyricState.diagnostics.candidates = response.candidates;
      lyricState.diagnostics.requestDurationMs = Math.round(performance.now() - startedAt);
      lyricState.status = response.candidates.length ? "selecting-candidate" : "no-match";
      lyricState.errorMessage = null;
    } catch (error) {
      this.handleError(error, generation);
    }
  }

  useAppleMusicLyrics(): void {
    this.request?.abort();
    this.generation += 1;
    lyricState.source = "apple-music";
    lyricState.status = "idle";
    lyricState.lyrics = null;
    lyricState.lyricDiagnostics = null;
    lyricState.errorMessage = null;
  }

  async useNetEaseLyrics(): Promise<void> {
    if (!lyricState.track) return;
    await this.processTrack(lyricState.track, true);
  }

  async manualSearch(query: string): Promise<void> {
    const track = lyricState.track;
    if (!track) return;
    const { signal, generation } = this.begin("searching");
    const startedAt = performance.now();
    try {
      const response = await this.client.search(track, query, signal);
      if (!this.isCurrent(generation)) return;
      lyricState.candidates = response.candidates;
      lyricState.diagnostics.searchQueries = response.queries;
      lyricState.diagnostics.candidates = response.candidates;
      lyricState.diagnostics.requestDurationMs = Math.round(performance.now() - startedAt);
      lyricState.status = response.candidates.length ? "selecting-candidate" : "no-match";
      lyricState.errorMessage = null;
    } catch (error) {
      this.handleError(error, generation);
    }
  }

  async chooseCandidate(candidate: TrackCandidate, remember: boolean): Promise<void> {
    const track = lyricState.track;
    const trackKey = lyricState.trackKey;
    if (!track || !trackKey) return;
    const { signal, generation } = this.begin("fetching-lyrics");
    const startedAt = performance.now();
    try {
      const response = await this.loadLyrics(candidate.neteaseId, track.durationMs, signal, false);
      if (!this.isCurrent(generation)) return;
      if (remember) await this.storage.saveMapping(trackKey, track, candidate.neteaseId);
      this.acceptLyrics(response, candidate.neteaseId, performance.now() - startedAt);
    } catch (error) {
      this.handleError(error, generation);
    }
  }

  async processTrack(track: TrackQuery | null, bypassCache = false): Promise<void> {
    this.request?.abort();
    const generation = ++this.generation;
    this.resetTrackState(track);
    if (!track) return;
    if (!settings.autoMatch && !bypassCache) {
      lyricState.status = "idle";
      return;
    }
    lyricState.status = "resolving-track";
    this.updateConnectionDiagnostics();
    try {
      const trackKey = await createTrackKey(track);
      if (!this.isCurrent(generation)) return;
      lyricState.trackKey = trackKey;
      lyricState.diagnostics.trackKey = trackKey;
      if (!bypassCache && settings.cacheEnabled) {
        const failure = await this.storage.getFailure(trackKey);
        if (failure) {
          lyricState.diagnostics.cache = "hit";
          lyricState.status = failure;
          lyricState.errorMessage = null;
          return;
        }
      }
      const mapping = await this.storage.getMapping(trackKey, track);
      if (mapping) {
        const { signal } = this.begin("fetching-lyrics", generation);
        const startedAt = performance.now();
        const response = await this.loadLyrics(mapping.neteaseId, track.durationMs, signal, bypassCache);
        if (!this.isCurrent(generation)) return;
        this.acceptLyrics(response, mapping.neteaseId, performance.now() - startedAt);
        return;
      }
      const { signal } = this.begin("searching", generation);
      const startedAt = performance.now();
      const response = await this.client.resolve(track, signal, bypassCache);
      if (!this.isCurrent(generation)) return;
      lyricState.diagnostics.searchQueries = response.queries;
      lyricState.diagnostics.candidates = response.candidates;
      lyricState.diagnostics.requestDurationMs = Math.round(performance.now() - startedAt);
      lyricState.candidates = response.candidates;
      if (response.state === "ready" && response.lyrics && response.match && response.lyricDiagnostics) {
        const wrapped: LyricsResponse = {
          schemaVersion: SCHEMA_VERSION,
          lyrics: response.lyrics,
          diagnostics: response.lyricDiagnostics,
        };
        if (settings.cacheEnabled) await this.storage.saveLyrics(wrapped, track.durationMs, settings.cacheTtlDays);
        this.acceptLyrics(wrapped, response.match.neteaseId, performance.now() - startedAt);
        return;
      }
      if (response.state === "selecting-candidate") {
        lyricState.status = "selecting-candidate";
        lyricState.errorMessage = null;
        return;
      }
      lyricState.status = response.state;
      lyricState.errorMessage = null;
      if (response.state === "no-match" || response.state === "no-lyrics") await this.storage.saveFailure(trackKey, response.state);
    } catch (error) {
      this.handleError(error, generation);
    }
  }

  private async loadLyrics(
    neteaseId: string,
    durationMs: number | undefined,
    signal: AbortSignal,
    bypassCache: boolean,
  ): Promise<LyricsResponse> {
    if (!bypassCache && settings.cacheEnabled) {
      const cached = await this.storage.getLyrics(neteaseId, durationMs);
      if (cached) {
        lyricState.diagnostics.cache = "hit";
        return cached;
      }
      lyricState.diagnostics.cache = "miss";
    } else {
      lyricState.diagnostics.cache = "bypassed";
    }
    const response = await this.client.lyrics(neteaseId, durationMs, signal, bypassCache);
    if (settings.cacheEnabled) await this.storage.saveLyrics(response, durationMs, settings.cacheTtlDays);
    return response;
  }

  private acceptLyrics(response: LyricsResponse, neteaseId: string, durationMs: number): void {
    lyricState.lyrics = response.lyrics;
    lyricState.lyricDiagnostics = response.diagnostics;
    lyricState.status = "ready";
    lyricState.errorMessage = null;
    lyricState.diagnostics.selectedNeteaseId = neteaseId;
    lyricState.diagnostics.lyricFields = response.diagnostics.fields;
    lyricState.diagnostics.requestDurationMs = Math.round(durationMs);
  }

  private begin(status: RequestState, generation?: number): { signal: AbortSignal; generation: number } {
    this.request?.abort();
    this.request = new AbortController();
    const currentGeneration = generation ?? ++this.generation;
    lyricState.status = status;
    lyricState.errorMessage = null;
    return { signal: this.request.signal, generation: currentGeneration };
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation;
  }

  private resetTrackState(track: TrackQuery | null): void {
    lyricState.source = "netease";
    lyricState.track = track;
    lyricState.trackKey = null;
    lyricState.lyrics = null;
    lyricState.lyricDiagnostics = null;
    lyricState.candidates = [];
    lyricState.errorMessage = null;
    lyricState.status = "idle";
    const providerProbe = lyricState.diagnostics.providerProbe;
    const simpleLyricViewProbe = lyricState.diagnostics.simpleLyricViewProbe;
    const trackSourceProbe = lyricState.diagnostics.trackSourceProbe;
    const connectionProbe = lyricState.diagnostics.connectionProbe;
    lyricState.diagnostics = {
      ...emptyDiagnostics(),
      connectionMode: settings.connectionMode,
      upstreamType: settings.connectionMode === "direct" ? "netease-direct" : "custom-gateway",
      requestTarget: settings.connectionMode === "direct" ? "https://music.163.com" : settings.gatewayUrl,
      ...(connectionProbe ? { connectionProbe } : {}),
      ...(trackSourceProbe ? { trackSourceProbe } : {}),
      ...(providerProbe ? { providerProbe } : {}),
      ...(simpleLyricViewProbe ? { simpleLyricViewProbe } : {}),
      ...(track ? { track } : {}),
    };
  }

  private cancel(nextState: RequestState): void {
    this.request?.abort();
    this.generation += 1;
    lyricState.status = nextState;
    lyricState.lyrics = null;
  }

  private handleError(error: unknown, generation: number): void {
    if (!this.isCurrent(generation)) return;
    if (error instanceof DOMException && error.name === "AbortError") {
      lyricState.status = "cancelled";
      return;
    }
    const pluginError = error instanceof PluginError ? error : new PluginError("SERVICE_ERROR", "Unexpected lyrics error.");
    lyricState.diagnostics.lastErrorCode = pluginError.code;
    lyricState.errorMessage = pluginError.message;
    lyricState.status = pluginError.code === "NO_MATCH"
      ? "no-match"
      : pluginError.code === "NO_LYRICS"
        ? "no-lyrics"
        : pluginError.code === "TIMEOUT"
          ? "timeout"
          : pluginError.code === "RATE_LIMITED"
            ? "rate-limited"
            : "service-error";
  }

  private updateConnectionDiagnostics(): void {
    lyricState.diagnostics.connectionMode = settings.connectionMode;
    lyricState.diagnostics.upstreamType = settings.connectionMode === "direct" ? "netease-direct" : "custom-gateway";
    lyricState.diagnostics.requestTarget = settings.connectionMode === "direct" ? "https://music.163.com" : settings.gatewayUrl;
  }
}

export const lyricController = new LyricController();
