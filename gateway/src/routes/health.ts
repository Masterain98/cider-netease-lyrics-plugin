import { SCHEMA_VERSION } from "@cider-netease/shared";
import type { Hono } from "hono";

export function registerHealthRoute(app: Hono): void {
  app.get("/health", (context) =>
    context.json({ status: "ok", service: "cider-netease-lyrics-gateway", schemaVersion: SCHEMA_VERSION }),
  );
}
