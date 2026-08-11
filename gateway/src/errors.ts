import type { LyricsErrorCode } from "@cider-netease/shared";

export class GatewayError extends Error {
  constructor(
    public readonly code: LyricsErrorCode,
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "GatewayError";
  }
}

export function toGatewayError(error: unknown): GatewayError {
  if (error instanceof GatewayError) return error;
  if (error instanceof Error && error.name === "AbortError") {
    return new GatewayError("TIMEOUT", "The lyrics request timed out.", 504);
  }
  return new GatewayError("SERVICE_ERROR", "The lyrics gateway could not complete the request.", 500);
}
