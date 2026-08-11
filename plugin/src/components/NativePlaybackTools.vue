<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { saveConfig, useCider, useCiderAudio } from "@ciderapp/pluginkit";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { settings } from "../stores/settings-store";
import { readFavoriteState, type FavoriteHostStore } from "../utils/favorite-state";

type AudioFeature = "ciderPPE" | "spatial";
type HostAudioSettings = {
  enabled?: boolean;
  ciderPPE?: boolean;
  spatial?: boolean;
};
type HostConfig = { audio?: { ciderAudio?: HostAudioSettings } };
type ReloadableCiderAudio = { hierarchical_loading?: () => void };

const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey) => translate(locale.value, key);
function readHostConfig() {
  try {
    return useCider()?.config?.getRef?.() as HostConfig | undefined;
  } catch {
    return undefined;
  }
}

const audioEngineEnabled = ref(false);
const ppeActive = ref(false);
const spatialActive = ref(false);
const favoriteHost = ref<HTMLElement>();
const favoriteAvailable = ref(false);
const favoriteActive = ref(false);
const favoriteMotion = ref<"added" | "removed" | null>(null);
const favoriteTooltipDismissed = ref(false);
let stateTimer: ReturnType<typeof setInterval> | undefined;
let favoriteMotionTimer: ReturnType<typeof setTimeout> | undefined;
let favoriteObserver: MutationObserver | undefined;
let favoriteObservedRoot: Node | undefined;
let pendingFavorite: { target: boolean; expiresAt: number } | undefined;

function syncAudioState() {
  const audio = readHostConfig()?.audio?.ciderAudio;
  audioEngineEnabled.value = Boolean(audio?.enabled);
  ppeActive.value = Boolean(audio?.ciderPPE);
  spatialActive.value = Boolean(audio?.spatial);
}

function tooltip(key: MessageKey) {
  return audioEngineEnabled.value ? t(key) : t("audio.requiresEngine");
}

function toggleAudioFeature(feature: AudioFeature) {
  const audio = readHostConfig()?.audio?.ciderAudio;
  if (!audio?.enabled) return;
  const nextValue = feature === "ciderPPE" ? !ppeActive.value : !spatialActive.value;
  audio[feature] = nextValue;
  if (feature === "ciderPPE") ppeActive.value = nextValue;
  else spatialActive.value = nextValue;
  try {
    (useCiderAudio() as unknown as ReloadableCiderAudio | undefined)?.hierarchical_loading?.();
  } finally {
    void saveConfig().catch(() => undefined);
  }
}

function favoriteRoot() {
  const host = favoriteHost.value;
  return host?.shadowRoot ?? host;
}

function nativeFavoriteButton() {
  return favoriteRoot()?.querySelector<HTMLButtonElement>("button.mediaitem-rating") ?? undefined;
}

function favoriteStore(): FavoriteHostStore | undefined {
  return window.CiderApp?.musicKitStore as FavoriteHostStore | undefined;
}

function syncFavoriteState() {
  const button = nativeFavoriteButton();
  favoriteAvailable.value = Boolean(button);
  const hostState = readFavoriteState(favoriteStore(), button);
  if (pendingFavorite) {
    if (hostState === pendingFavorite.target) pendingFavorite = undefined;
    else if (performance.now() < pendingFavorite.expiresAt) {
      favoriteActive.value = pendingFavorite.target;
      return;
    } else pendingFavorite = undefined;
  }
  if (hostState !== undefined) favoriteActive.value = hostState;
}

function observeFavorite() {
  favoriteObserver?.disconnect();
  const root = favoriteRoot();
  if (!root) return;
  favoriteObservedRoot = root;
  favoriteObserver = new MutationObserver(syncFavoriteState);
  favoriteObserver.observe(root, { attributes: true, childList: true, subtree: true });
  syncFavoriteState();
}

async function playFavoriteMotion(nextState: boolean) {
  if (favoriteMotionTimer) clearTimeout(favoriteMotionTimer);
  favoriteMotion.value = null;
  await nextTick();
  requestAnimationFrame(() => {
    favoriteMotion.value = nextState ? "added" : "removed";
    favoriteMotionTimer = setTimeout(() => { favoriteMotion.value = null; }, 720);
  });
}

function toggleFavorite(event: MouseEvent) {
  const button = nativeFavoriteButton();
  if (!button) return;
  if (event.detail > 0) {
    favoriteTooltipDismissed.value = true;
    (event.currentTarget as HTMLButtonElement | null)?.blur();
  }
  const nextState = !favoriteActive.value;
  pendingFavorite = { target: nextState, expiresAt: performance.now() + 2_400 };
  favoriteActive.value = nextState;
  void playFavoriteMotion(nextState);
  button.click();
  for (const delay of [80, 240, 600, 1_200, 2_500]) window.setTimeout(syncFavoriteState, delay);
}

onMounted(() => {
  syncAudioState();
  observeFavorite();
  stateTimer = setInterval(() => {
    syncAudioState();
    if (favoriteRoot() !== favoriteObservedRoot) observeFavorite();
    syncFavoriteState();
  }, 750);
});

onUnmounted(() => {
  if (stateTimer) clearInterval(stateTimer);
  if (favoriteMotionTimer) clearTimeout(favoriteMotionTimer);
  favoriteObserver?.disconnect();
  favoriteObservedRoot = undefined;
  pendingFavorite = undefined;
});
</script>

<template>
  <div class="native-playback-tools" :aria-label="t('audio.group')">
    <div class="audio-feature-tools">
      <button
        type="button"
        class="native-feature-button"
        :class="{ active: ppeActive }"
        :disabled="!audioEngineEnabled"
        :data-tooltip="tooltip('audio.ppe')"
        :aria-label="tooltip('audio.ppe')"
        :aria-pressed="ppeActive"
        @click="toggleAudioFeature('ciderPPE')"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/><path d="m7.5 4.21 4.5 2.6 4.5-2.6M7.5 19.79V14.6L3 12m18 0-4.5 2.6v5.19M3.27 6.96 12 12.01l8.73-5.05M12 22.08V12"/></svg>
      </button>
      <button
        type="button"
        class="native-feature-button spatial-button"
        :class="{ active: spatialActive }"
        :disabled="!audioEngineEnabled"
        :data-tooltip="tooltip('audio.spatial')"
        :aria-label="tooltip('audio.spatial')"
        :aria-pressed="spatialActive"
        @click="toggleAudioFeature('spatial')"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M10 12.5c-5.92 0-9 3.5-9 5.5v1h18v-1c0-2-3.08-5.5-9-5.5ZM10 1a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z"/><path class="waves" d="M3.05 4.1a6.5 6.5 0 0 0 0 5.8M.9 2.1a9.3 9.3 0 0 0 0 9.8m16.05-7.8a6.5 6.5 0 0 1 0 5.8m2.15-7.8a9.3 9.3 0 0 1 0 9.8"/></svg>
      </button>
    </div>
    <div
      class="favorite-action"
      :class="{ 'tooltip-dismissed': favoriteTooltipDismissed }"
      :data-tooltip="favoriteActive ? t('audio.removeFavorite') : t('audio.addFavorite')"
      @pointerleave="favoriteTooltipDismissed = false"
    >
      <cider-glass-player-actions ref="favoriteHost" class="native-favorite-host" aria-hidden="true" />
      <button
        type="button"
        class="favorite-proxy"
        :class="[{ active: favoriteActive }, favoriteMotion ? `motion-${favoriteMotion}` : '']"
        :disabled="!favoriteAvailable"
        :aria-label="favoriteActive ? t('audio.removeFavorite') : t('audio.addFavorite')"
        :aria-pressed="favoriteActive"
        @click="toggleFavorite"
      >
        <span class="favorite-ring" aria-hidden="true" />
        <span class="favorite-particles" aria-hidden="true">
          <i v-for="index in 6" :key="index" :style="{ '--particle-index': index - 1 }" />
        </span>
        <svg class="favorite-heart" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 20.35 10.55 19C5.4 14.36 2 11.28 2 7.5 2 4.42 4.42 2 7.5 2c1.74 0 3.41.81 4.5 2.08A6.02 6.02 0 0 1 16.5 2C19.58 2 22 4.42 22 7.5c0 3.78-3.4 6.86-8.55 11.51L12 20.35Z" />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.native-playback-tools,
.audio-feature-tools { display: flex; align-items: center; justify-content: center; gap: .7rem; }
.native-feature-button,
.favorite-proxy { position: relative; display: grid; flex: 0 0 auto; width: 2.35rem; height: 2.35rem; place-items: center; border: 1px solid transparent; border-radius: .78rem; padding: 0; color: rgb(255 255 255 / 61%); background: transparent; cursor: pointer; transition: color 260ms ease, border-color 260ms ease, background 260ms ease, transform 420ms cubic-bezier(.22, 1, .36, 1), box-shadow 360ms ease; }
.native-feature-button:hover:not(:disabled),
.favorite-proxy:hover:not(:disabled) { color: #fff; border-color: rgb(255 255 255 / 11%); background: rgb(255 255 255 / 8%); transform: translateY(-2px); }
.native-feature-button:active:not(:disabled),
.favorite-proxy:active:not(:disabled) { transform: scale(.94); }
.native-feature-button.active,
.favorite-proxy.active { color: #fff; border-color: rgb(231 43 66 / 42%); background: rgb(231 43 66 / 68%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 20%), 0 .5rem 1.35rem rgb(126 8 28 / 24%); }
.native-feature-button:disabled,
.favorite-proxy:disabled { opacity: .42; cursor: default; }
.native-feature-button svg { width: 1.08rem; height: 1.08rem; fill: none; stroke: currentColor; stroke-width: 1.55; stroke-linecap: round; stroke-linejoin: round; }
.spatial-button svg { width: 1.12rem; height: 1.12rem; fill: currentColor; stroke: none; }
.spatial-button .waves { fill: none; stroke: currentColor; stroke-width: 1.25; }
.favorite-action { position: relative; display: grid; width: 2.35rem; height: 2.35rem; place-items: center; }
.native-favorite-host { display: none; }
.favorite-heart { position: relative; z-index: 2; width: 1.08rem; height: 1.08rem; fill: transparent; stroke: currentColor; stroke-width: 1.7; stroke-linejoin: round; transform-origin: 50% 58%; transition: fill 260ms ease, stroke 260ms ease, transform 420ms cubic-bezier(.22, 1, .36, 1), filter 320ms ease; }
.favorite-proxy.active .favorite-heart { fill: currentColor; transform: scale(1.04); filter: drop-shadow(0 .18rem .34rem rgb(91 0 14 / 38%)); }
.favorite-ring { position: absolute; z-index: 1; width: 1.2rem; height: 1.2rem; border: .08rem solid rgb(255 91 112 / 72%); border-radius: 50%; opacity: 0; pointer-events: none; }
.favorite-particles { position: absolute; z-index: 3; inset: 50%; pointer-events: none; }
.favorite-particles i { --particle-angle: calc(var(--particle-index) * 60deg - 90deg); position: absolute; width: .16rem; height: .16rem; border-radius: 50%; opacity: 0; background: #ff7b8d; box-shadow: 0 0 .32rem rgb(255 64 88 / 70%); transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateY(-.38rem) scale(.3); }
.favorite-proxy.motion-added .favorite-heart { animation: favorite-heart-pop 620ms cubic-bezier(.2, 1.55, .32, 1) both; }
.favorite-proxy.motion-added .favorite-ring { animation: favorite-ring-bloom 580ms cubic-bezier(.2, .8, .28, 1) both; }
.favorite-proxy.motion-added .favorite-particles i { animation: favorite-particle-burst 560ms cubic-bezier(.17, .67, .3, 1) calc(var(--particle-index) * 18ms) both; }
.favorite-proxy.motion-removed .favorite-heart { animation: favorite-heart-release 480ms cubic-bezier(.22, 1, .36, 1) both; }
.favorite-proxy.motion-removed .favorite-ring { animation: favorite-ring-release 420ms ease-out both; }
@keyframes favorite-heart-pop { 0% { transform: scale(.72); } 42% { transform: scale(1.36) rotate(-5deg); } 68% { transform: scale(.92) rotate(2deg); } 100% { transform: scale(1.04); } }
@keyframes favorite-ring-bloom { 0% { opacity: .75; transform: scale(.55); } 100% { opacity: 0; transform: scale(2.15); } }
@keyframes favorite-particle-burst { 0% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateY(-.34rem) scale(.25); } 28% { opacity: 1; } 100% { opacity: 0; transform: translate(-50%, -50%) rotate(var(--particle-angle)) translateY(-1.12rem) scale(1); } }
@keyframes favorite-heart-release { 0% { transform: scale(1.04); } 38% { transform: scale(.76); } 72% { transform: scale(1.1); } 100% { transform: scale(1); } }
@keyframes favorite-ring-release { 0% { opacity: .45; transform: scale(1.5); } 100% { opacity: 0; transform: scale(.55); } }
.favorite-proxy:focus-visible,
.native-feature-button:focus-visible { outline: .13rem solid #fff; outline-offset: .12rem; }
.native-feature-button::before,
.favorite-action::before { position: absolute; z-index: 5; top: calc(100% + .48rem); bottom: auto; left: 50%; max-width: 15rem; padding: .42rem .56rem; border: 1px solid rgb(255 255 255 / 9%); border-radius: .56rem; color: rgb(255 255 255 / 86%); background: rgb(13 12 16 / 91%); box-shadow: 0 .7rem 2rem rgb(0 0 0 / 24%); content: attr(data-tooltip); font-size: .65rem; font-weight: 620; line-height: 1.3; opacity: 0; pointer-events: none; transform: translate(-50%, -.25rem); white-space: nowrap; backdrop-filter: blur(14px); transition: opacity 180ms ease, transform 280ms cubic-bezier(.22, 1, .36, 1); }
.native-feature-button:hover::before,
.native-feature-button:focus-visible::before,
.favorite-action:not(.tooltip-dismissed):hover::before,
.favorite-action:not(.tooltip-dismissed):focus-within::before { opacity: 1; transform: translate(-50%, 0); }
.native-feature-button:first-child::before { left: 0; transform: translate(0, -.25rem); }
.native-feature-button:first-child:hover::before,
.native-feature-button:first-child:focus-visible::before { transform: translate(0, 0); }
@media (prefers-reduced-motion: reduce) {
  .native-feature-button, .favorite-proxy, .favorite-heart { transition-duration: .01ms !important; }
  .favorite-proxy.motion-added .favorite-heart,
  .favorite-proxy.motion-added .favorite-ring,
  .favorite-proxy.motion-added .favorite-particles i,
  .favorite-proxy.motion-removed .favorite-heart,
  .favorite-proxy.motion-removed .favorite-ring { animation: none !important; }
}
</style>
