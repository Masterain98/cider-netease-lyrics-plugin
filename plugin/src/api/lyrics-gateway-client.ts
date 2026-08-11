import type { ApiErrorResponse, LyricsResponse, ResolveResponse, SearchResponse, TrackQuery } from "@cider-netease/shared";
import { PluginError } from "../domain/errors";
import type { LyricsClient } from "./lyrics-client";

function normalizedBaseUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new PluginError("GATEWAY_NOT_CONFIGURED", "Configure a lyrics gateway before matching songs.");
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new PluginError("GATEWAY_NOT_CONFIGURED", "The configured gateway URL is invalid.");
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new PluginError("GATEWAY_NOT_CONFIGURED", "The gateway must use HTTP(S) and must not contain credentials.");
  }
  return url.toString().replace(/\/$/u, "");
}

export class LyricsGatewayClient implements LyricsClient {
  constructor(
    private readonly gatewayUrl: () => string,
    private readonly timeoutMs: () => number,
  ) {}

  resolve(track: TrackQuery, signal?: AbortSignal, bypassCache = false): Promise<ResolveResponse> {
    return this.request("/v1/resolve", { method: "POST", body: JSON.stringify(track), ...this.cachePolicy(bypassCache) }, signal);
  }

  search(track: TrackQuery, query: string | undefined, signal?: AbortSignal, bypassCache = false): Promise<SearchResponse> {
    return this.request(
      "/v1/search",
      { method: "POST", body: JSON.stringify({ track, ...(query?.trim() ? { query: query.trim() } : {}) }), ...this.cachePolicy(bypassCache) },
      signal,
    );
  }

  lyrics(neteaseId: string, durationMs?: number, signal?: AbortSignal, bypassCache = false): Promise<LyricsResponse> {
    const query = durationMs ? `?durationMs=${encodeURIComponent(String(durationMs))}` : "";
    return this.request(`/v1/lyrics/${encodeURIComponent(neteaseId)}${query}`, { method: "GET", ...this.cachePolicy(bypassCache) }, signal);
  }

  health(signal?: AbortSignal): Promise<{ status: string; schemaVersion: number }> {
    return this.request("/health", { method: "GET" }, signal);
  }

  private cachePolicy(bypassCache: boolean): Pick<RequestInit, "cache" | "headers"> {
    return bypassCache ? { cache: "no-store", headers: { "cache-control": "no-cache" } } : {};
  }

  private async request<T>(path: string, init: RequestInit, externalSignal?: AbortSignal): Promise<T> {
    const controller = new AbortController();
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    const timeout = setTimeout(() => controller.abort(), Math.max(1_000, this.timeoutMs()));
    try {
      const response = await fetch(`${normalizedBaseUrl(this.gatewayUrl())}${path}`, {
        ...init,
        headers: { "content-type": "application/json", accept: "application/json", ...init.headers },
        signal: controller.signal,
      });
      const payload = (await response.json().catch(() => null)) as T | ApiErrorResponse | null;
      if (!response.ok) {
        const apiError = payload && typeof payload === "object" && "error" in payload ? (payload as ApiErrorResponse).error : undefined;
        const code = apiError?.code ?? (response.status === 429 ? "RATE_LIMITED" : response.status === 504 ? "TIMEOUT" : "SERVICE_ERROR");
        throw new PluginError(code, apiError?.message ?? `The lyrics gateway returned HTTP ${response.status}.`, apiError?.retryAfterSeconds);
      }
      if (!payload) throw new PluginError("SERVICE_ERROR", "The lyrics gateway returned an empty response.");
      return payload as T;
    } catch (error) {
      if (error instanceof PluginError) throw error;
      if (controller.signal.aborted) {
        if (externalSignal?.aborted) throw new DOMException("Request cancelled", "AbortError");
        throw new PluginError("TIMEOUT", "The lyrics request timed out.");
      }
      throw new PluginError("UPSTREAM_UNAVAILABLE", "The lyrics gateway is unavailable.");
    } finally {
      clearTimeout(timeout);
      externalSignal?.removeEventListener("abort", abort);
    }
  }
}
