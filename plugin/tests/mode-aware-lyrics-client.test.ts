import type { LyricsClient } from "../src/api/lyrics-client";
import { ModeAwareLyricsClient } from "../src/api/mode-aware-lyrics-client";
import { describe, expect, it, vi } from "vitest";

const track = { title: "Song", artist: "Artist", album: "Album" };

function clientDouble(): LyricsClient {
  return {
    resolve: vi.fn(),
    search: vi.fn(),
    lyrics: vi.fn(),
  };
}

describe("mode-aware lyrics client", () => {
  it("selects the mode at the start of every call and never falls back", async () => {
    let mode: "direct" | "gateway" = "direct";
    const direct = clientDouble();
    const gateway = clientDouble();
    vi.mocked(direct.resolve).mockRejectedValue(new Error("direct failed"));
    vi.mocked(gateway.resolve).mockResolvedValue({ schemaVersion: 1, state: "no-match", queries: [], candidates: [], reason: "none" });
    const client = new ModeAwareLyricsClient(() => mode, direct, gateway);

    await expect(client.resolve(track)).rejects.toThrow("direct failed");
    expect(gateway.resolve).not.toHaveBeenCalled();

    mode = "gateway";
    await expect(client.resolve(track)).resolves.toMatchObject({ state: "no-match" });
    expect(gateway.resolve).toHaveBeenCalledTimes(1);

    vi.mocked(gateway.search).mockResolvedValue({ schemaVersion: 1, queries: ["manual"], candidates: [] });
    vi.mocked(gateway.lyrics).mockRejectedValue(new Error("gateway lyric failed"));
    await expect(client.search(track, "manual")).resolves.toMatchObject({ queries: ["manual"] });
    await expect(client.lyrics("1")).rejects.toThrow("gateway lyric failed");
    expect(direct.search).not.toHaveBeenCalled();
    expect(direct.lyrics).not.toHaveBeenCalled();
  });
});
