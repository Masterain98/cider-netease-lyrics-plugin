import { describe, expect, it, vi } from "vitest";
import { readFavoriteState, type FavoriteButtonLike, type FavoriteHostStore } from "../src/utils/favorite-state";

function button(attributes: Record<string, string>, icon?: Record<string, string>): FavoriteButtonLike {
  return {
    getAttribute: (name) => attributes[name] ?? null,
    querySelector: vi.fn(() => icon ? button(icon) : null),
  };
}

describe("favorite state", () => {
  it("prefers Cider's optimistic rating for immediate feedback", () => {
    const store: FavoriteHostStore = {
      player: { inFavorites: false, nowPlayingItem: { id: "song-1" } },
      getOptimisticValues: () => ({ favorited: true }),
    };
    expect(readFavoriteState(store)).toBe(true);
  });

  it("reads the authoritative player state after Cider settles", () => {
    expect(readFavoriteState({ player: { inFavorites: true } })).toBe(true);
    expect(readFavoriteState({ player: { inFavorites: false } })).toBe(false);
  });

  it("falls back to native accessibility and icon state", () => {
    expect(readFavoriteState(undefined, button({ "aria-pressed": "true" }))).toBe(true);
    expect(readFavoriteState(undefined, button({}, { name: "ion-ios-star-outline", color: "default" }))).toBe(false);
    expect(readFavoriteState(undefined, button({}, { name: "ion-ios-star", color: "primary" }))).toBe(true);
  });
});

