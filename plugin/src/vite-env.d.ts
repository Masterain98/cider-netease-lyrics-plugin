/// <reference types="vite/client" />

interface Window {
  CiderApp?: {
    musicKitStore?: {
      inFavorites?: boolean;
      nowPlayingItem?: unknown;
      nowPlayingItemMediaItem?: unknown;
      getOptimisticValues?: (id: string) => { favorited?: boolean } | undefined;
      player?: {
        inFavorites?: boolean;
        nowPlayingItem?: unknown;
        mediaElement?: HTMLAudioElement | null;
      };
    };
  };
  __PLUGINSYS__?: {
    Components?: {
      Lyrics?: { registerLyricProvider?: (...args: unknown[]) => unknown };
      ImmersiveLayouts?: unknown;
    };
    Stores?: {
      appleMusicStore?: {
        audioElement?: HTMLAudioElement;
        nowPlayingItem?: unknown;
      };
    };
  };
}

declare const cplugin: { ce_prefix: string; identifier: string };
