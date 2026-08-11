import { afterEach, describe, expect, it, vi } from "vitest";
import { canSeekPlayback, getHostAudioElement, getPlaybackTime, seekPlayback } from "../src/adapters/playback-adapter";

afterEach(() => vi.unstubAllGlobals());

function installHost(audioElement: unknown, fallback: unknown = null): void {
  vi.stubGlobal("window", { __PLUGINSYS__: { Stores: { appleMusicStore: { audioElement } } } });
  vi.stubGlobal("document", { querySelector: vi.fn().mockReturnValue(fallback) });
}

describe("Cider playback adapter", () => {
  it("prefers the host audio element and reads finite playback time", () => {
    const audio = { currentTime: 12.5 };
    installHost(audio, { currentTime: 99 });

    expect(getHostAudioElement()).toBe(audio);
    expect(getPlaybackTime()).toBe(12.5);
    expect(canSeekPlayback()).toBe(true);
  });

  it("falls back to the document audio element and performs guarded seek", () => {
    const audio = { currentTime: 0 };
    installHost(null, audio);

    expect(seekPlayback(42.25)).toBe(true);
    expect(audio.currentTime).toBe(42.25);
    expect(seekPlayback(-1)).toBe(false);
    expect(seekPlayback(Number.NaN)).toBe(false);
  });

  it("uses the guarded Cider player media element before a document fallback", () => {
    const ciderAudio = { currentTime: 7 };
    const documentAudio = { currentTime: 99 };
    vi.stubGlobal("window", { __PLUGINSYS__: { Stores: {} }, CiderApp: { musicKitStore: { player: { mediaElement: ciderAudio } } } });
    vi.stubGlobal("document", { querySelector: vi.fn().mockReturnValue(documentAudio) });

    expect(getHostAudioElement()).toBe(ciderAudio);
    expect(getPlaybackTime()).toBe(7);
  });

  it("fails closed when playback time or the seek setter is unsafe", () => {
    const audio = {
      get currentTime() {
        return Number.NaN;
      },
      set currentTime(_value: number) {
        throw new Error("read only");
      },
    };
    installHost(audio);

    expect(getPlaybackTime()).toBe(0);
    expect(seekPlayback(3)).toBe(false);
  });
});
