export type CiderTrackSource = "pluginkit-apple-music" | "guarded-cider-player" | "unavailable";

export function getGuardedCiderPlayer(): {
  nowPlayingItem?: unknown;
  mediaElement?: HTMLAudioElement | null;
} | null {
  return window.CiderApp?.musicKitStore?.player ?? null;
}

export function getFallbackNowPlayingItem(): unknown {
  return window.__PLUGINSYS__?.Stores?.appleMusicStore?.nowPlayingItem
    ?? getGuardedCiderPlayer()?.nowPlayingItem
    ?? null;
}

export function detectCiderTrackSource(): CiderTrackSource {
  if (window.__PLUGINSYS__?.Stores?.appleMusicStore) return "pluginkit-apple-music";
  if (getGuardedCiderPlayer()) return "guarded-cider-player";
  return "unavailable";
}

