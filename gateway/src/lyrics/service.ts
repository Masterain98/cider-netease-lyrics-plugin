import { buildLyricResponse } from "@cider-netease/shared";
import type { NeteasePort } from "../netease/types";

export class LyricService {
  constructor(private readonly netease: NeteasePort) {}

  async get(neteaseId: string, durationMs?: number, bypassCache = false) {
    return buildLyricResponse(neteaseId, await this.netease.lyrics(neteaseId, bypassCache), durationMs);
  }
}
