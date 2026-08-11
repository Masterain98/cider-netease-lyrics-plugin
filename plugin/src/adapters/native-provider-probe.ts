import { detectCiderTrackSource, type CiderTrackSource } from "./cider-host-access";

export interface HostCapabilityProbe {
  appleMusicStoreAvailable: boolean;
  trackSource: CiderTrackSource;
  nativeProviderAvailable: boolean;
  nativeProviderEnabled: false;
  simpleLyricViewRegistered: boolean;
  simpleLyricViewAcceptsXmlProperty: boolean;
  rendererDecision: "custom-vue";
}

export function probeHostCapabilities(): HostCapabilityProbe {
  const trackSource = detectCiderTrackSource();
  const appleMusicStoreAvailable = trackSource !== "unavailable";
  const nativeProviderAvailable = typeof window.__PLUGINSYS__?.Components?.Lyrics?.registerLyricProvider === "function";
  const constructor = customElements.get("cider-simple-lyric-view");
  let simpleLyricViewAcceptsXmlProperty = false;
  if (constructor) {
    const element = document.createElement("cider-simple-lyric-view") as HTMLElement & { lyricsXml?: string };
    const ttml = `<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="1s">Probe</p></div></body></tt>`;
    try {
      element.lyricsXml = ttml;
      simpleLyricViewAcceptsXmlProperty = element.lyricsXml === ttml;
    } catch {
      simpleLyricViewAcceptsXmlProperty = false;
    }
  }
  return {
    appleMusicStoreAvailable,
    trackSource,
    nativeProviderAvailable,
    nativeProviderEnabled: false,
    simpleLyricViewRegistered: Boolean(constructor),
    simpleLyricViewAcceptsXmlProperty,
    rendererDecision: "custom-vue",
  };
}
