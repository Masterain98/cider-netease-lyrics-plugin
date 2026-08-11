import { canonicalTrackKeyInput, SCHEMA_VERSION, type LyricsResponse, type TrackQuery } from "@cider-netease/shared";
import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export interface MappingRecord {
  schemaVersion: number;
  trackKey: string;
  fingerprint: string;
  neteaseId: string;
  track: TrackQuery;
  updatedAt: number;
}

interface LyricsCacheRecord {
  schemaVersion: number;
  key: string;
  value: LyricsResponse;
  expiresAt: number;
}

interface FailureCacheRecord {
  schemaVersion: number;
  trackKey: string;
  state: "no-match" | "no-lyrics";
  expiresAt: number;
}

interface LyricsDatabase extends DBSchema {
  mappings: { key: string; value: MappingRecord };
  lyrics: { key: string; value: LyricsCacheRecord };
  failures: { key: string; value: FailureCacheRecord };
}

let databasePromise: Promise<IDBPDatabase<LyricsDatabase>> | undefined;

function database(): Promise<IDBPDatabase<LyricsDatabase>> {
  databasePromise ??= openDB<LyricsDatabase>("cider-netease-lyrics", 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("mappings")) db.createObjectStore("mappings", { keyPath: "trackKey" });
      if (!db.objectStoreNames.contains("lyrics")) db.createObjectStore("lyrics", { keyPath: "key" });
      if (!db.objectStoreNames.contains("failures")) db.createObjectStore("failures", { keyPath: "trackKey" });
    },
  });
  return databasePromise;
}

export function mappingFingerprint(track: TrackQuery): string {
  return canonicalTrackKeyInput({ ...track, appleMusicId: undefined });
}

export function validSchemaRecord<T extends { schemaVersion: number }>(record: T | undefined): T | undefined {
  return record?.schemaVersion === SCHEMA_VERSION ? record : undefined;
}

export function migrateMappingRecord(record: unknown): MappingRecord | undefined {
  if (!record || typeof record !== "object") return undefined;
  const candidate = record as Partial<MappingRecord> & { schemaVersion?: number };
  if (!candidate.trackKey || !candidate.neteaseId || !candidate.track) return undefined;
  if (candidate.schemaVersion === SCHEMA_VERSION && candidate.fingerprint && candidate.updatedAt) return candidate as MappingRecord;
  if (candidate.schemaVersion === 0) {
    return {
      schemaVersion: SCHEMA_VERSION,
      trackKey: candidate.trackKey,
      neteaseId: candidate.neteaseId,
      track: candidate.track,
      fingerprint: mappingFingerprint(candidate.track),
      updatedAt: candidate.updatedAt ?? Date.now(),
    };
  }
  return undefined;
}

function lyricKey(neteaseId: string, durationMs?: number): string {
  return `${neteaseId}:${Math.round((durationMs ?? 0) / 5_000)}`;
}

export class MappingStore {
  async getMapping(trackKey: string, track: TrackQuery): Promise<MappingRecord | undefined> {
    const db = await database();
    const stored = await db.get("mappings", trackKey);
    const record = migrateMappingRecord(stored);
    if (!record) return undefined;
    if (stored?.schemaVersion !== SCHEMA_VERSION) await db.put("mappings", record);
    if (record.fingerprint !== mappingFingerprint(track)) return undefined;
    return record;
  }

  async saveMapping(trackKey: string, track: TrackQuery, neteaseId: string): Promise<void> {
    const db = await database();
    const trackSnapshot: TrackQuery = { ...track };
    await db.put("mappings", {
      schemaVersion: SCHEMA_VERSION,
      trackKey,
      fingerprint: mappingFingerprint(trackSnapshot),
      neteaseId,
      track: trackSnapshot,
      updatedAt: Date.now(),
    });
  }

  async deleteMapping(trackKey: string): Promise<void> {
    await (await database()).delete("mappings", trackKey);
  }

  async listMappings(): Promise<MappingRecord[]> {
    const records = await (await database()).getAll("mappings");
    return records.flatMap((record) => migrateMappingRecord(record) ?? []).sort((left, right) => right.updatedAt - left.updatedAt);
  }

  async clearMappings(): Promise<void> {
    await (await database()).clear("mappings");
  }

  async getLyrics(neteaseId: string, durationMs?: number): Promise<LyricsResponse | undefined> {
    const db = await database();
    const key = lyricKey(neteaseId, durationMs);
    const record = validSchemaRecord(await db.get("lyrics", key));
    if (!record || record.expiresAt <= Date.now()) {
      if (record) await db.delete("lyrics", key);
      return undefined;
    }
    return record.value;
  }

  async saveLyrics(value: LyricsResponse, durationMs: number | undefined, ttlDays: number): Promise<void> {
    const key = lyricKey(value.lyrics.neteaseId, durationMs);
    await (await database()).put("lyrics", {
      schemaVersion: SCHEMA_VERSION,
      key,
      value,
      expiresAt: Date.now() + ttlDays * 86_400_000,
    });
  }

  async clearLyrics(): Promise<void> {
    await (await database()).clear("lyrics");
  }

  async getFailure(trackKey: string): Promise<FailureCacheRecord["state"] | undefined> {
    const db = await database();
    const record = validSchemaRecord(await db.get("failures", trackKey));
    if (!record || record.expiresAt <= Date.now()) {
      if (record) await db.delete("failures", trackKey);
      return undefined;
    }
    return record.state;
  }

  async saveFailure(trackKey: string, state: FailureCacheRecord["state"]): Promise<void> {
    await (await database()).put("failures", {
      schemaVersion: SCHEMA_VERSION,
      trackKey,
      state,
      expiresAt: Date.now() + 10 * 60_000,
    });
  }

  async clearFailure(trackKey: string): Promise<void> {
    await (await database()).delete("failures", trackKey);
  }
}

export function resetDatabaseForTests(): void {
  databasePromise = undefined;
}
