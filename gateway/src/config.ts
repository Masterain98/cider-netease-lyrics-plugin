import { z } from "zod";

const EnvSchema = z.object({
  GATEWAY_HOST: z.string().default("127.0.0.1"),
  GATEWAY_PORT: z.coerce.number().int().min(1).max(65_535).default(3100),
  CORS_ORIGINS: z.string().default(
    "http://127.0.0.1:10767,http://localhost:10767,http://127.0.0.1:3058,http://localhost:3058",
  ),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(30_000).default(7_000),
  UPSTREAM_TIMEOUT_MS: z.coerce.number().int().min(500).max(25_000).default(5_500),
  SEARCH_CACHE_TTL_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(600_000),
  LYRICS_CACHE_TTL_MS: z.coerce.number().int().min(1_000).max(86_400_000).default(3_600_000),
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).max(10_000).default(60),
  RATE_LIMIT_PER_KEY_PER_MINUTE: z.coerce.number().int().min(1).max(1_000).default(12),
  CIRCUIT_FAILURE_THRESHOLD: z.coerce.number().int().min(1).max(100).default(5),
  CIRCUIT_RESET_MS: z.coerce.number().int().min(1_000).max(600_000).default(30_000),
});

export type GatewayConfig = ReturnType<typeof loadConfig>;

export function loadConfig(environment: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.parse(environment);
  return {
    host: parsed.GATEWAY_HOST,
    port: parsed.GATEWAY_PORT,
    corsOrigins: parsed.CORS_ORIGINS.split(",").map((origin) => origin.trim()).filter(Boolean),
    requestTimeoutMs: parsed.REQUEST_TIMEOUT_MS,
    upstreamTimeoutMs: parsed.UPSTREAM_TIMEOUT_MS,
    searchCacheTtlMs: parsed.SEARCH_CACHE_TTL_MS,
    lyricsCacheTtlMs: parsed.LYRICS_CACHE_TTL_MS,
    rateLimitPerMinute: parsed.RATE_LIMIT_PER_MINUTE,
    rateLimitPerKeyPerMinute: parsed.RATE_LIMIT_PER_KEY_PER_MINUTE,
    circuitFailureThreshold: parsed.CIRCUIT_FAILURE_THRESHOLD,
    circuitResetMs: parsed.CIRCUIT_RESET_MS,
  };
}
