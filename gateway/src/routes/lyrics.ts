import { NeteaseIdSchema } from "@cider-netease/shared";
import type { Hono } from "hono";
import { GatewayError } from "../errors";
import { withTimeout } from "../infrastructure/timeout";
import type { RouteDependencies } from "./dependencies";

export function registerLyricsRoute(app: Hono, dependencies: RouteDependencies): void {
  app.get("/v1/lyrics/:neteaseId", async (context) => {
    const parsedId = NeteaseIdSchema.safeParse(context.req.param("neteaseId"));
    const durationValue = context.req.query("durationMs");
    const durationMs = durationValue ? Number(durationValue) : undefined;
    if (!parsedId.success || (durationMs !== undefined && (!Number.isFinite(durationMs) || durationMs <= 0))) {
      throw new GatewayError("INVALID_REQUEST", "The lyrics request is invalid.", 400);
    }
    const bypassCache = context.req.header("cache-control")?.toLocaleLowerCase("en-US").includes("no-cache") ?? false;
    dependencies.enforceKeyRate(`netease:${parsedId.data}`);
    const result = await withTimeout(
      dependencies.lyricService.get(parsedId.data, durationMs, bypassCache),
      dependencies.config.requestTimeoutMs,
      "The lyrics request timed out.",
    );
    if (!result) throw new GatewayError("NO_LYRICS", "NetEase has no line-synced lyrics for this song.", 404);
    return context.json(result);
  });
}
