import { serve } from "@hono/node-server";
import { createApp } from "./app";
import { loadConfig } from "./config";
import { NeteaseClient } from "./netease/client";

const config = loadConfig();
const app = createApp({ config, netease: new NeteaseClient(config) });

serve({ fetch: app.fetch, hostname: config.host, port: config.port }, (info) => {
  console.log(`Lyrics gateway listening on http://${info.address}:${info.port}`);
});
