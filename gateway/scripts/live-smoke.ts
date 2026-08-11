import type { LyricsResponse, SearchResponse, TrackQuery } from "@cider-netease/shared";
import { createApp } from "../src/app";
import { loadConfig } from "../src/config";
import { NeteaseClient } from "../src/netease/client";

const config = loadConfig({
  REQUEST_TIMEOUT_MS: "12000",
  UPSTREAM_TIMEOUT_MS: "9000",
  RATE_LIMIT_PER_MINUTE: "20",
  RATE_LIMIT_PER_KEY_PER_MINUTE: "10",
});
const app = createApp({ config, netease: new NeteaseClient(config) });
const track: TrackQuery = { title: "Hello", artist: "Adele", album: "25", durationMs: 295_502 };

const health = await app.request("/health");
if (!health.ok) throw new Error(`Health smoke failed with HTTP ${health.status}.`);

const search = await app.request("/v1/search", {
  method: "POST",
  headers: { "content-type": "application/json", "cache-control": "no-cache" },
  body: JSON.stringify({ track }),
});
if (!search.ok) throw new Error(`Search smoke failed with HTTP ${search.status}.`);
const searchBody = await search.json() as SearchResponse;
if (!searchBody.candidates.length) throw new Error("Search smoke returned no candidates in this egress region.");

const knownNeteaseId = "36841430";
const lyrics = await app.request(`/v1/lyrics/${knownNeteaseId}?durationMs=${track.durationMs}`, {
  headers: { "cache-control": "no-cache" },
});
if (!lyrics.ok) throw new Error(`Lyric smoke failed with HTTP ${lyrics.status}.`);
const lyricBody = await lyrics.json() as LyricsResponse;
if (!lyricBody.lyrics.lyrics.length || !lyricBody.diagnostics.fields.lrc) {
  throw new Error("Lyric smoke returned no usable line-synced LRC data.");
}

console.log(JSON.stringify({
  checkedAt: new Date().toISOString(),
  schemaVersion: lyricBody.schemaVersion,
  queryCount: searchBody.queries.length,
  candidateCount: searchBody.candidates.length,
  topCandidateIds: searchBody.candidates.slice(0, 5).map((candidate) => candidate.neteaseId),
  lyricNeteaseId: lyricBody.lyrics.neteaseId,
  lyricLineCount: lyricBody.lyrics.lyrics.length,
  lyricFields: lyricBody.diagnostics.fields,
  translationIsChinese: lyricBody.diagnostics.translationIsChinese,
}, null, 2));
