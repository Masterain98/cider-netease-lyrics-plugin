type MediaItem = {
  id?: unknown;
  attributes?: {
    inFavorites?: unknown;
    personalRating?: unknown;
  };
};

export type FavoriteHostStore = {
  player?: {
    inFavorites?: unknown;
    nowPlayingItem?: unknown;
  };
  nowPlayingItem?: unknown;
  nowPlayingItemMediaItem?: unknown;
  getOptimisticValues?: (id: string) => { favorited?: unknown } | undefined;
};

export type FavoriteButtonLike = {
  getAttribute(name: string): string | null;
  querySelector(selector: string): FavoriteButtonLike | null;
};

function asMediaItem(value: unknown): MediaItem | undefined {
  return value && typeof value === "object" ? value as MediaItem : undefined;
}

function nowPlayingItem(store?: FavoriteHostStore): MediaItem | undefined {
  return asMediaItem(store?.player?.nowPlayingItem)
    ?? asMediaItem(store?.nowPlayingItem)
    ?? asMediaItem(store?.nowPlayingItemMediaItem);
}

export function readFavoriteState(
  store?: FavoriteHostStore,
  button?: FavoriteButtonLike,
): boolean | undefined {
  const item = nowPlayingItem(store);
  const itemId = typeof item?.id === "string" || typeof item?.id === "number" ? String(item.id) : undefined;
  if (itemId && store?.getOptimisticValues) {
    try {
      const optimistic = store.getOptimisticValues(itemId)?.favorited;
      if (typeof optimistic === "boolean") return optimistic;
    } catch {
      // Host stores can be replaced while Cider changes tracks; continue with stable fallbacks.
    }
  }

  if (typeof store?.player?.inFavorites === "boolean") return store.player.inFavorites;
  if (typeof item?.attributes?.inFavorites === "boolean") return item.attributes.inFavorites;
  if (typeof item?.attributes?.personalRating === "number") return item.attributes.personalRating === 1;

  const pressed = button?.getAttribute("aria-pressed");
  if (pressed === "true" || pressed === "false") return pressed === "true";

  const icon = button?.querySelector("[name*='star'], [name*='heart']");
  const iconName = icon?.getAttribute("name") ?? "";
  if (icon?.getAttribute("color") === "primary") return true;
  if (iconName) return !iconName.endsWith("-outline");
  return undefined;
}
