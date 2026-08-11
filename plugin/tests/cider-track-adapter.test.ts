import { AppleMusic } from "@ciderapp/pluginkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CiderTrackAdapter, quickTrackIdentity, trackQueryFromMediaItem } from "../src/adapters/cider-track-adapter";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Cider track adapter", () => {
  it("reads modern resource attributes", () => {
    expect(
      trackQueryFromMediaItem({
        id: "catalog-1",
        attributes: {
          name: "Song",
          artistName: "Artist",
          albumName: "Album",
          durationInMillis: 241_321,
          isrc: "US-ABC-12-34567",
        },
      }),
    ).toEqual({
      appleMusicId: "catalog-1",
      title: "Song",
      artist: "Artist",
      album: "Album",
      durationMs: 241_321,
      isrc: "USABC1234567",
    });
  });

  it("reads direct Cider fields and converts second-based playback duration", () => {
    expect(
      trackQueryFromMediaItem({ title: "Song", artistName: "Artist", albumName: "Album", playbackDuration: 241.25 }),
    ).toMatchObject({ title: "Song", durationMs: 241_250 });
  });

  it("omits malformed host ISRC values instead of invalidating the whole request", () => {
    expect(
      trackQueryFromMediaItem({
        id: "catalog-2",
        attributes: { name: "Song", artistName: "Artist", albumName: "Album", isrc: "MCJPJPE561300690" },
      }),
    ).toEqual({ appleMusicId: "catalog-2", title: "Song", artist: "Artist", album: "Album" });
  });

  it("rejects incomplete local media metadata and deduplicates normalized identities", () => {
    expect(trackQueryFromMediaItem({ title: "Song" })).toBeNull();
    expect(quickTrackIdentity({ title: "Song—Name", artist: "ARTIST", album: "A", durationMs: 241_000 })).toBe(
      quickTrackIdentity({ title: "song-name", artist: "artist", album: "A", durationMs: 242_000 }),
    );
  });

  it("debounces metadata events, deduplicates the stable identity and cleans up listeners", async () => {
    vi.useFakeTimers();
    let item: unknown = null;
    vi.spyOn(AppleMusic, "nowPlayingItem", "get").mockImplementation(() => item);
    const handlers = new Map<string, EventListener>();
    const audio = {
      currentTime: 0,
      addEventListener: vi.fn((name: string, handler: EventListener) => handlers.set(name, handler)),
      removeEventListener: vi.fn((name: string) => handlers.delete(name)),
    };
    vi.stubGlobal("window", { __PLUGINSYS__: { Stores: { appleMusicStore: { audioElement: audio } } } });
    vi.stubGlobal("document", { querySelector: vi.fn().mockReturnValue(null) });
    const onTrack = vi.fn();
    const adapter = new CiderTrackAdapter(onTrack);

    adapter.start();
    await vi.advanceTimersByTimeAsync(151);
    expect(onTrack).toHaveBeenLastCalledWith(null);

    item = { id: "1", attributes: { name: "Song", artistName: "Artist", albumName: "Album" } };
    handlers.get("loadedmetadata")?.(new Event("loadedmetadata"));
    await vi.advanceTimersByTimeAsync(151);
    expect(onTrack).toHaveBeenLastCalledWith(expect.objectContaining({ appleMusicId: "1", title: "Song" }));
    const callCount = onTrack.mock.calls.length;

    handlers.get("durationchange")?.(new Event("durationchange"));
    await vi.advanceTimersByTimeAsync(1_200);
    expect(onTrack).toHaveBeenCalledTimes(callCount);

    adapter.stop();
    item = { id: "2", attributes: { name: "Other", artistName: "Artist", albumName: "Album" } };
    await vi.advanceTimersByTimeAsync(2_000);
    expect(onTrack).toHaveBeenCalledTimes(callCount);
    expect(audio.removeEventListener).toHaveBeenCalledTimes(2);
  });

  it("uses the guarded Cider player when the public PluginKit store is unavailable", async () => {
    vi.useFakeTimers();
    vi.spyOn(AppleMusic, "nowPlayingItem", "get").mockImplementation(() => {
      throw new Error("PluginKit store unavailable");
    });
    const item = { id: "fallback-1", attributes: { name: "Fallback", artistName: "Artist", albumName: "Album" } };
    vi.stubGlobal("window", { CiderApp: { musicKitStore: { player: { nowPlayingItem: item } } } });
    vi.stubGlobal("document", { querySelector: vi.fn().mockReturnValue(null) });
    const onTrack = vi.fn();
    const adapter = new CiderTrackAdapter(onTrack);

    adapter.start();
    await vi.advanceTimersByTimeAsync(151);

    expect(onTrack).toHaveBeenCalledWith(expect.objectContaining({ appleMusicId: "fallback-1", title: "Fallback" }));
    adapter.stop();
  });
});
