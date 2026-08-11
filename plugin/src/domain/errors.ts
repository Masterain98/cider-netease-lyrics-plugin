import type { LyricsErrorCode } from "@cider-netease/shared";

export type PluginErrorCode =
  | LyricsErrorCode
  | "DIRECT_CONNECTION_FAILED"
  | "DIRECT_ACCESS_BLOCKED"
  | "DIRECT_API_CHANGED"
  | "GATEWAY_NOT_CONFIGURED"
  | "INVALID_TRACK_METADATA"
  | "INCOMPATIBLE_HOST";

export class PluginError extends Error {
  constructor(
    public readonly code: PluginErrorCode,
    message: string,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "PluginError";
  }
}
