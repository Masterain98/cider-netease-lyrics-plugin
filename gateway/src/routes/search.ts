import { SearchRequestSchema } from "@cider-netease/shared";
import type { Hono } from "hono";
import { GatewayError } from "../errors";
import { withTimeout } from "../infrastructure/timeout";
import type { RouteDependencies } from "./dependencies";

export function registerSearchRoute(app: Hono, dependencies: RouteDependencies): void {
  app.post("/v1/search", async (context) => {
    const body = await context.req.json().catch(() => null);
    const parsed = SearchRequestSchema.safeParse(body);
    if (!parsed.success) throw new GatewayError("INVALID_REQUEST", "The search request is invalid.", 400);
    const bypassCache = context.req.header("cache-control")?.toLocaleLowerCase("en-US").includes("no-cache") ?? false;
    dependencies.enforceKeyRate(`track:${await dependencies.trackKey(parsed.data.track)}`);
    const result = await withTimeout(
      dependencies.matchService.search(parsed.data.track, parsed.data.query, bypassCache),
      dependencies.config.requestTimeoutMs,
      "The search request timed out.",
    );
    return context.json(result);
  });
}
