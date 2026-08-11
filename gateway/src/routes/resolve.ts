import { SCHEMA_VERSION, TrackQuerySchema, type ResolveResponse } from "@cider-netease/shared";
import type { Hono } from "hono";
import { GatewayError } from "../errors";
import { withTimeout } from "../infrastructure/timeout";
import type { RouteDependencies } from "./dependencies";

export function registerResolveRoute(app: Hono, dependencies: RouteDependencies): void {
  app.post("/v1/resolve", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = TrackQuerySchema.safeParse(body);
    if (!parsed.success) throw new GatewayError("INVALID_REQUEST", "The track metadata is invalid.", 400);
    const bypassCache = context.req.header("cache-control")?.toLocaleLowerCase("en-US").includes("no-cache") ?? false;
    const key = await dependencies.trackKey(parsed.data);
    dependencies.enforceKeyRate(`track:${key}`);
    const response = await dependencies.coalescer.run(key, () =>
      withTimeout(resolve(parsed.data, dependencies, bypassCache), dependencies.config.requestTimeoutMs, "The resolve request timed out."),
    );
    return context.json(response);
  });
}

async function resolve(
  track: Parameters<RouteDependencies["matchService"]["resolve"]>[0],
  dependencies: RouteDependencies,
  bypassCache: boolean,
): Promise<ResolveResponse> {
  const { search, selection } = await dependencies.matchService.resolve(track, bypassCache);
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
  const lyrics = await dependencies.lyricService.get(selection.selected.neteaseId, track.durationMs, bypassCache);
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
}
