import { getConnInfo } from "@hono/node-server/conninfo";
import {
  SCHEMA_VERSION,
  createTrackKey,
  type ApiErrorResponse,
  type TrackQuery,
} from "@cider-netease/shared";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import type { GatewayConfig } from "./config";
import { GatewayError, toGatewayError } from "./errors";
import { RequestCoalescer } from "./infrastructure/coalescer";
import { SlidingWindowRateLimiter } from "./infrastructure/rate-limiter";
import { LyricService } from "./lyrics/service";
import { MatchService } from "./matching/service";
import type { NeteasePort } from "./netease/types";
import { registerHealthRoute } from "./routes/health";
import { registerLyricsRoute } from "./routes/lyrics";
import { registerResolveRoute } from "./routes/resolve";
import { registerSearchRoute } from "./routes/search";

export interface AppDependencies {
  config: GatewayConfig;
  netease: NeteasePort;
  trackKey?: (track: TrackQuery) => Promise<string>;
}

export function createApp({ config, netease, trackKey = createTrackKey }: AppDependencies): Hono {
  const app = new Hono();
  const rateLimiter = new SlidingWindowRateLimiter();
  const matchService = new MatchService(netease);
  const lyricService = new LyricService(netease);
  const enforceKeyRate = (key: string) => {
    const result = rateLimiter.check(key, config.rateLimitPerKeyPerMinute);
    if (!result.allowed) {
      throw new GatewayError("RATE_LIMITED", "Too many requests for this song. Try again later.", 429, result.retryAfterSeconds);
    }
  };
  const dependencies = {
    config,
    matchService,
    lyricService,
    coalescer: new RequestCoalescer(),
    trackKey,
    enforceKeyRate,
  };

  app.use("*", secureHeaders());
  app.use(
    "*",
    cors({
      origin: (origin) => (config.corsOrigins.includes(origin) ? origin : ""),
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type", "X-Request-ID", "Cache-Control"],
      exposeHeaders: ["X-Request-ID", "Retry-After"],
      maxAge: 86_400,
      credentials: false,
    }),
  );
  app.use("/v1/*", async (context, next) => {
    const contentLength = Number(context.req.header("content-length") ?? 0);
    if (contentLength > 16_384) throw new GatewayError("INVALID_REQUEST", "The request body is too large.", 413);
    let remoteAddress = "unknown";
    try {
      remoteAddress = getConnInfo(context).remote.address ?? "unknown";
    } catch {
      remoteAddress = "test-client";
    }
    const result = rateLimiter.check(`ip:${remoteAddress}`, config.rateLimitPerMinute);
    if (!result.allowed) {
      throw new GatewayError("RATE_LIMITED", "Too many requests. Try again later.", 429, result.retryAfterSeconds);
    }
    await next();
  });

  registerHealthRoute(app);
  registerSearchRoute(app, dependencies);
  registerLyricsRoute(app, dependencies);
  registerResolveRoute(app, dependencies);

  app.notFound((context) =>
    context.json<ApiErrorResponse>(
      { schemaVersion: SCHEMA_VERSION, error: { code: "INVALID_REQUEST", message: "Route not found." } },
      404,
    ),
  );
  app.onError((unknownError, context) => {
    const error = toGatewayError(unknownError);
    const requestId = context.req.header("x-request-id")?.slice(0, 128) || crypto.randomUUID();
    if (error.retryAfterSeconds) context.header("Retry-After", String(error.retryAfterSeconds));
    context.header("X-Request-ID", requestId);
    return context.json<ApiErrorResponse>(
      {
        schemaVersion: SCHEMA_VERSION,
        error: {
          code: error.code,
          message: error.message,
          requestId,
          ...(error.retryAfterSeconds ? { retryAfterSeconds: error.retryAfterSeconds } : {}),
        },
      },
      error.status as 400,
    );
  });

  return app;
}
