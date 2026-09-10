import { AppleMusic } from "@ciderapp/pluginkit";
import { afterEach, describe, expect, it, vi } from "vitest";
import { metadataFromMediaItem, TrackMetadataService } from "../src/utils/track-metadata";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("track metadata", () => {
  it("normalizes MusicKit fields and preserves the display fallback", () => {
    expect(metadataFromMediaItem({
      id: "song-1",
      attributes: {
        name: "软件",
        artistName: "Artist",
        albumName: "Album",
        composerName: "Composer",
        genreNames: ["Pop", "Pop"],
        releaseDate: "2024-02-03",
        trackNumber: 4,
        discNumber: 2,
        durationInMillis: 241_321,
        isrc: "US-ABC-12-34567",
        contentRating: "clean",
        hasLyrics: true,
        audioTraits: ["lossless"],
      },
    })).toEqual({
      title: "软件",
      artist: "Artist",
      album: "Album",
      composer: "Composer",
      genres: ["Pop"],
      releaseDate: "2024-02-03",
      trackNumber: 4,
      discNumber: 2,
      durationMs: 241_321,
      isrc: "USABC1234567",
      appleMusicId: "song-1",
      contentRating: "clean",
      hasLyrics: true,
      audioTraits: ["lossless"],
    });
  });

  it("reuses in-flight requests and caches the normalized catalog result", async () => {
    const item = { id: "song-2", attributes: { name: "Song", artistName: "Artist", albumName: "Album" } };
    vi.spyOn(AppleMusic, "nowPlayingItem", "get").mockReturnValue(item);
    const fetcher = vi.fn(async () => ({ attributes: { composerName: "Composer", genreNames: ["Rock"] } }));
    const service = new TrackMetadataService(fetcher);
    const track = { title: "Song", artist: "Artist", album: "Album", appleMusicId: "song-2" };

    const [first, second] = await Promise.all([service.load(track), service.load(track)]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(first.composer).toBe("Composer");
    expect(second.genres).toEqual(["Rock"]);
    await service.load(track);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("allows a failed request to be retried", async () => {
    vi.spyOn(AppleMusic, "nowPlayingItem", "get").mockReturnValue({ id: "song-3", attributes: { name: "Song", artistName: "Artist" } });
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({ attributes: { releaseDate: "2024-01-01" } });
    const service = new TrackMetadataService(fetcher);
    const track = { title: "Song", artist: "Artist", album: "", appleMusicId: "song-3" };
    await expect(service.load(track)).rejects.toThrow("temporary");
    await expect(service.load(track)).resolves.toMatchObject({ releaseDate: "2024-01-01" });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
