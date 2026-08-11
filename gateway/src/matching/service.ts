import {
  buildRankedSearchResponse,
  buildSearchQueries,
  selectCandidate,
  type SearchResponse,
  type TrackQuery,
} from "@cider-netease/shared";
import type { NeteasePort } from "../netease/types";

export class MatchService {
  constructor(private readonly netease: NeteasePort) {}

  async search(track: TrackQuery, manualQuery?: string, bypassCache = false): Promise<SearchResponse> {
    const queries = manualQuery ? [manualQuery] : buildSearchQueries(track);
    const batches = await Promise.all(queries.map((query) => this.netease.search(query, manualQuery ? 20 : 15, bypassCache)));
    return buildRankedSearchResponse(track, queries, batches);
  }

  async resolve(track: TrackQuery, bypassCache = false) {
    const search = await this.search(track, undefined, bypassCache);
    return { search, selection: selectCandidate(search.candidates) };
  }
}
