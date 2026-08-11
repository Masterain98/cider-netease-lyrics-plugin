import { getGuardedCiderPlayer } from "./cider-host-access";

export function getHostAudioElement(): HTMLAudioElement | null {
  return window.__PLUGINSYS__?.Stores?.appleMusicStore?.audioElement
    ?? getGuardedCiderPlayer()?.mediaElement
    ?? document.querySelector("audio");
}

export function getPlaybackTime(): number {
  const time = getHostAudioElement()?.currentTime;
  return typeof time === "number" && Number.isFinite(time) ? time : 0;
}

export function seekPlayback(timeSeconds: number): boolean {
  const audio = getHostAudioElement();
  if (!audio || !Number.isFinite(timeSeconds) || timeSeconds < 0) return false;
  try {
    audio.currentTime = timeSeconds;
    return true;
  } catch {
    return false;
  }
}

export function canSeekPlayback(): boolean {
  return Boolean(getHostAudioElement());
}
