<script setup lang="ts">
import { computed, ref, watch } from "vue";
import MatchChooser from "./MatchChooser.vue";
import LyricScroller from "./LyricScroller.vue";
import LyricsStatus from "./LyricsStatus.vue";
import PlaybackProgress from "./PlaybackProgress.vue";
import ImmersiveLyricsToolbar from "./ImmersiveLyricsToolbar.vue";
import NativePlaybackTools from "./NativePlaybackTools.vue";
import ArtworkCover from "./ArtworkCover.vue";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { lyricController, lyricState } from "../stores/lyric-store";
import { settings } from "../stores/settings-store";

type RightPanel = "lyrics" | "queue" | "history";
const activePanel = ref<RightPanel>("lyrics");
const appleLyricsAvailability = ref<"loading" | "available" | "unavailable">("loading");
const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey) => translate(locale.value, key);
const panelItems: Array<{ id: RightPanel; label: MessageKey }> = [
  { id: "lyrics", label: "panel.lyrics" },
  { id: "queue", label: "panel.queue" },
  { id: "history", label: "panel.history" },
];
watch(() => lyricState.source, () => { appleLyricsAvailability.value = "loading"; });
</script>

<template>
  <main class="netease-layout plugin-base">
    <aside class="now-playing">
      <div class="artwork-shell">
        <div class="artwork"><ArtworkCover /></div>
      </div>
      <div class="metadata">
        <h1>{{ lyricState.track?.title ?? t("player.noTrack") }}</h1>
        <p class="artist">{{ lyricState.track?.artist || t("player.waiting") }}</p>
        <p v-if="lyricState.track?.album" class="album">{{ lyricState.track.album }}</p>
      </div>
      <div class="controls">
        <PlaybackProgress :duration-ms="lyricState.track?.durationMs" />
        <div class="control-row">
          <NativePlaybackTools />
          <cider-lcdplayer-glass :show-lcd="false" compact />
        </div>
      </div>
    </aside>

    <section class="content">
      <header class="lyrics-toolbar">
        <nav class="panel-switcher" :aria-label="t('panel.switcher')" role="tablist">
          <button
            v-for="panel in panelItems"
            :key="panel.id"
            type="button"
            role="tab"
            :class="{ active: activePanel === panel.id }"
            :aria-selected="activePanel === panel.id"
            @click="activePanel = panel.id"
          >
            <svg v-if="panel.id === 'lyrics'" aria-hidden="true" viewBox="0 0 24 24"><path d="M8 5h11M8 9h11M8 13h7M5 5h.01M5 9h.01M5 13h.01M8 18c1.35 0 1.35-2 2.7-2s1.35 2 2.7 2 1.35-2 2.7-2 1.35 2 2.7 2"/></svg>
            <svg v-else-if="panel.id === 'queue'" aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h12M4 11h12M4 16h8M19 14v7m0-7 3 2"/></svg>
            <svg v-else aria-hidden="true" viewBox="0 0 24 24"><path d="M12 8v5l3 2M3.4 9A9 9 0 1 1 3 12m.4-3H7M3.4 9V5"/></svg>
            <span>{{ t(panel.label) }}</span>
          </button>
        </nav>
        <div class="lyrics-actions">
          <p
            v-if="activePanel === 'lyrics' && lyricState.status === 'ready' && lyricState.lyricDiagnostics && !lyricState.lyricDiagnostics.translationIsChinese"
            class="translation-note"
            role="status"
          >
            {{ t("lyrics.translationUnavailable") }}
          </p>
          <div v-if="activePanel === 'lyrics' && lyricState.source === 'apple-music'" class="source-switch" role="status">
            <span>{{ t("appleLyrics.source") }}</span>
            <button type="button" @click="lyricController.useNetEaseLyrics()">{{ t("appleLyrics.back") }}</button>
          </div>
        </div>
      </header>
      <ImmersiveLyricsToolbar v-if="activePanel === 'lyrics' && lyricState.source === 'netease'" />
      <Transition name="panel-view" mode="out-in">
        <div v-if="activePanel === 'lyrics'" key="lyrics" class="panel-view lyrics-view" role="tabpanel">
          <div
            v-if="lyricState.source === 'apple-music'"
            class="apple-native-lyrics"
            :class="{ unavailable: appleLyricsAvailability === 'unavailable' }"
          >
            <cider-immersive-lyric-view
              @has-lyrics="appleLyricsAvailability = 'available'"
              @no-lyrics-found="appleLyricsAvailability = 'unavailable'"
            />
            <section v-if="appleLyricsAvailability === 'unavailable'" class="apple-lyrics-empty" aria-live="polite">
              <span aria-hidden="true">♪</span>
              <div>
                <h2>{{ t("appleLyrics.unavailableTitle") }}</h2>
                <p>{{ t("appleLyrics.unavailableDescription") }}</p>
                <button type="button" @click="lyricController.useNetEaseLyrics()">{{ t("appleLyrics.back") }}</button>
              </div>
            </section>
          </div>
          <LyricScroller
            v-else-if="lyricState.status === 'ready' && lyricState.lyrics"
            :lines="lyricState.lyrics.lyrics"
            :translation-is-chinese="lyricState.lyricDiagnostics?.translationIsChinese ?? false"
          />
          <MatchChooser v-else-if="lyricState.status === 'selecting-candidate'" />
          <LyricsStatus v-else />
        </div>
        <div v-else :key="activePanel" class="panel-view native-panel" role="tabpanel">
          <cider-amqueue :has-tabs="false" :select-tab="activePanel" />
        </div>
      </Transition>
    </section>
  </main>
</template>

<style scoped>
.netease-layout {
  --netease-red: #e72b42;
  --netease-red-bright: #ff4058;
  --spring: cubic-bezier(.22, 1, .36, 1);
  position: relative;
  isolation: isolate;
  display: grid;
  grid-template-columns: minmax(23rem, 37.5vw) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  overflow: hidden;
  color: #fff;
  background: transparent;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 5%);
  font-family: var(--fontFamily, "Figtree", "Pretendard", "Segoe UI", sans-serif);
}
.netease-layout::before { content: ""; position: absolute; z-index: -2; inset: 0; pointer-events: none; background: rgb(5 6 9 / 14%); -webkit-backdrop-filter: blur(30px) saturate(122%) brightness(.82); backdrop-filter: blur(30px) saturate(122%) brightness(.82); }
.netease-layout::after { content: ""; position: absolute; z-index: -1; inset: 0; pointer-events: none; background: radial-gradient(circle at 20% 92%, rgb(231 43 66 / 11%), transparent 34%), radial-gradient(circle at 64% 36%, rgb(255 255 255 / 3%), transparent 32%), linear-gradient(102deg, rgb(6 6 9 / 34%) 0 37.5%, rgb(6 6 9 / 12%) 55%, rgb(6 6 9 / 22%) 100%); box-shadow: inset 0 0 0 1px rgb(255 255 255 / 3%); }
.now-playing { min-width: 0; min-height: 0; display: flex; flex-direction: column; align-items: center; gap: clamp(1.1rem, 2.3vh, 1.8rem); padding: clamp(2.5rem, 5.3vh, 5rem) clamp(2rem, 3.9vw, 4.75rem) clamp(1.75rem, 3vh, 2.4rem); background: linear-gradient(90deg, rgb(5 5 8 / 10%), transparent 82%); }
.now-playing::after { content: ""; position: absolute; top: 8%; bottom: 8%; left: 37.5vw; width: 1px; opacity: .68; background: linear-gradient(transparent, rgb(255 255 255 / 9%) 14% 86%, transparent); }
.artwork-shell { width: min(100%, 55vh, 34rem); padding: clamp(.32rem, .5vw, .5rem); border-radius: clamp(1.45rem, 2.5vw, 2.35rem); background: linear-gradient(145deg, rgb(255 255 255 / 12%), rgb(255 255 255 / 3%)); box-shadow: inset 0 1px 0 rgb(255 255 255 / 12%), 0 2.8rem 7rem rgb(2 2 5 / 42%); }
.artwork { aspect-ratio: 1; overflow: hidden; border-radius: calc(clamp(1.45rem, 2.5vw, 2.35rem) - clamp(.32rem, .5vw, .5rem)); background: rgb(255 255 255 / 3%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 13%); }
.artwork :deep(cider-immersive-artwork) { display: block; width: 100%; height: 100%; transition: transform 900ms var(--spring), filter 900ms var(--spring); }
.artwork :deep(cider-immersive-artwork > *), .artwork :deep(cider-immersive-artwork .q-img), .artwork :deep(cider-immersive-artwork .q-img__container), .artwork :deep(cider-immersive-artwork .q-img__image), .artwork :deep(cider-immersive-artwork img), .artwork :deep(cider-immersive-artwork picture), .artwork :deep(cider-immersive-artwork video) { display: block !important; width: 100% !important; height: 100% !important; min-width: 100% !important; min-height: 100% !important; object-fit: cover !important; object-position: center !important; }
.artwork-shell:hover .artwork :deep(cider-immersive-artwork), .artwork-shell:hover .artwork :deep(.artwork-cover) { transform: scale(1.018); filter: saturate(1.06); }
.metadata { width: min(100%, 34rem); min-width: 0; }
.metadata h1 { margin: 0 0 .6rem; overflow: hidden; color: rgb(255 255 255 / 98%); font-size: clamp(1.8rem, 3vw, 3.45rem); font-weight: 720; line-height: 1.02; letter-spacing: -.052em; text-overflow: ellipsis; white-space: nowrap; }
.metadata p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.metadata .artist { color: rgb(255 255 255 / 68%); font-size: clamp(.95rem, 1.25vw, 1.12rem); font-weight: 600; }
.metadata .album { margin-top: .32rem; color: rgb(255 255 255 / 39%); font-size: clamp(.78rem, 1vw, .9rem); }
.controls { position: relative; width: min(100%, 34rem); margin-top: auto; padding-bottom: .55rem; }
.control-row { --side-button-size: clamp(2.1rem, 2.6vw, 2.35rem); --side-gap: clamp(.35rem, .5vw, .55rem); --group-offset: clamp(7.15rem, 9vw, 7.75rem); position: relative; width: 100%; height: 3.8rem; }
.controls :deep(cider-lcdplayer-glass) { display: block; width: 100%; --keyColor: var(--netease-red-bright); --musicKeyColor: var(--netease-red-bright); --progressColor: var(--netease-red-bright); --vibrantDivider: rgb(255 255 255 / 15%); }
.controls :deep(.lcd-player-glass) { width: 100%; }
.controls :deep(.lcdplayer-top) { position: relative; display: grid !important; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr) !important; grid-template-rows: 3.8rem !important; grid-template-areas: ". lcdplayer-controls ." !important; align-items: center !important; gap: 0 !important; height: auto !important; padding: 0 !important; overflow: visible !important; }
.controls :deep(.lcdplayer-controls) { grid-area: lcdplayer-controls !important; justify-self: center; width: auto !important; min-width: max-content; }
.controls :deep(.lcdplayer-info) { display: none !important; }
.controls :deep(.time-remaining) { display: none !important; }
.controls :deep(.playback-controls) { width: auto !important; min-width: max-content; }
.controls :deep(.am-playback-actions) { display: flex !important; width: auto !important; height: auto !important; align-items: center; justify-content: center !important; gap: clamp(.2rem, .35vw, .35rem) !important; }
.controls :deep(.am-playback-actions > .playback-action-button) { margin-inline: 0 !important; }
.controls :deep(.lcdplayer-side) { position: absolute !important; top: 50%; left: calc(50% + var(--group-offset) + var(--side-button-size) + var(--side-gap)); display: flex !important; align-items: center; justify-content: flex-start; margin: 0 !important; gap: var(--side-gap) !important; white-space: nowrap; transform: translateY(-50%); }
.control-row :deep(.native-playback-tools) { display: contents; }
.control-row :deep(.audio-feature-tools) { position: absolute; z-index: 2; top: 50%; right: calc(50% + var(--group-offset)); justify-content: flex-end; gap: var(--side-gap); transform: translateY(-50%); }
.control-row :deep(.favorite-action) { position: absolute; z-index: 2; top: 50%; left: calc(50% + var(--group-offset)); transform: translateY(-50%); }
.controls :deep(.am-playback-actions > .playback-action-button),
.controls :deep(.lcdplayer-side .toolbar-btn),
.controls :deep(.lcdplayer-side button) { flex: 0 0 auto; width: 2.35rem !important; height: 2.35rem !important; opacity: .65; transition: opacity 360ms var(--spring), transform 480ms var(--spring), color 360ms var(--spring), background-color 360ms ease; }
.control-row :deep(.native-feature-button),
.control-row :deep(.favorite-action),
.control-row :deep(.favorite-proxy),
.controls :deep(.lcdplayer-side .toolbar-btn),
.controls :deep(.lcdplayer-side button) { width: var(--side-button-size) !important; height: var(--side-button-size) !important; }
.controls :deep(.am-playback-actions > .playback-action-button) { width: clamp(2.15rem, 2.5vw, 2.35rem) !important; height: 2.35rem !important; }
.controls :deep(.am-playback-actions > .playback-action-button:nth-child(3)) { width: clamp(3.15rem, 3.5vw, 3.25rem) !important; height: clamp(3.15rem, 3.5vw, 3.25rem) !important; margin-inline: 0 !important; }
.controls :deep(.am-playback-actions > .playback-action-button:hover),
.controls :deep(.lcdplayer-side .toolbar-btn:hover),
.controls :deep(.lcdplayer-side button:hover) { opacity: 1; transform: translateY(-2px); }
.controls :deep(.am-playback-actions > .playback-action-button:active),
.controls :deep(.lcdplayer-side .toolbar-btn:active),
.controls :deep(.lcdplayer-side button:active) { transform: translateY(0) scale(.94); }
.controls :deep(.lcdplayer-side input[type="range"]) { height: .92rem; border: 0; border-radius: 999px; background: linear-gradient(90deg, var(--progressColor, #ff4058) var(--progress, 0%), rgb(255 255 255 / 15%) var(--progress, 0%)); transition: background 520ms var(--spring), filter 420ms var(--spring), height 420ms var(--spring); }
.controls :deep(.lcdplayer-side input[type="range"]::-webkit-slider-thumb) { transition: transform 420ms var(--spring), box-shadow 420ms ease; }
.controls :deep(.lcdplayer-side input[type="range"]:hover), .controls :deep(.lcdplayer-side input[type="range"]:focus-visible), .controls :deep(.lcdplayer-side input[type="range"]:active) { filter: brightness(1.12); }
.content { position: relative; min-width: 0; min-height: 0; display: grid; place-items: center; overflow: clip; }
.panel-view { position: absolute; inset: 0; min-width: 0; min-height: 0; }
.lyrics-view { display: grid; place-items: center; }
.apple-native-lyrics { position: absolute; inset: 0; min-width: 0; min-height: 0; padding-top: clamp(4.8rem, 9vh, 6.4rem); overflow: hidden; }
.apple-native-lyrics :deep(cider-immersive-lyric-view) { display: block; width: 100%; height: 100%; color: inherit; transition: opacity 260ms ease, filter 420ms var(--spring); }
.apple-native-lyrics.unavailable :deep(cider-immersive-lyric-view) { opacity: 0; filter: blur(.5rem); pointer-events: none; }
.apple-lyrics-empty { position: absolute; z-index: 2; inset: 0; display: grid; grid-template-columns: 3.25rem minmax(0, 1fr); place-content: center; align-items: start; gap: 1rem; width: min(35rem, calc(100% - 3rem)); height: max-content; margin: auto; box-sizing: border-box; border: 1px solid rgb(255 255 255 / 10%); border-radius: 1.2rem; padding: 1.25rem; background: rgb(13 12 17 / 62%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 7%), 0 1.5rem 5rem rgb(0 0 0 / 26%); backdrop-filter: blur(20px) saturate(115%); }
.apple-lyrics-empty > span { display: grid; place-items: center; width: 3.25rem; height: 3.25rem; border-radius: .95rem; color: #fff; background: rgb(255 255 255 / 10%); font-size: 1.2rem; }
.apple-lyrics-empty h2 { margin: .1rem 0 .38rem; color: rgb(255 255 255 / 92%); font-size: 1.15rem; letter-spacing: -.025em; }
.apple-lyrics-empty p { max-width: 34rem; margin: 0; color: rgb(255 255 255 / 51%); font-size: .82rem; line-height: 1.55; }
.apple-lyrics-empty button { min-height: 2.4rem; margin-top: .85rem; border: 1px solid rgb(231 43 66 / 30%); border-radius: .72rem; padding: 0 .82rem; color: #fff; background: rgb(231 43 66 / 58%); font: inherit; font-size: .76rem; font-weight: 690; cursor: pointer; transition: background 220ms ease, transform 340ms var(--spring); }
.apple-lyrics-empty button:hover { background: rgb(231 43 66 / 76%); transform: translateY(-1px); }
.apple-lyrics-empty button:active { transform: scale(.96); }
.native-panel { padding: clamp(5.8rem, 11vh, 7.2rem) clamp(1.5rem, 4vw, 4.5rem) clamp(1.5rem, 4vh, 3rem); overflow: hidden; }
.native-panel :deep(cider-amqueue) { display: block; width: 100%; height: 100%; }
.native-panel :deep(.queue-layout) { overflow: hidden !important; border: 0 !important; border-radius: 1.35rem !important; color: rgb(255 255 255 / 82%); background: rgb(13 12 16 / 34%) !important; box-shadow: inset 0 1px 0 rgb(255 255 255 / 8%); backdrop-filter: blur(18px) saturate(120%); }
.native-panel :deep(.queue-header) { min-height: 3rem; padding: .45rem .75rem !important; border-bottom: 1px solid rgb(255 255 255 / 7%); background: transparent; }
.native-panel :deep(.queue-header .shelf-title),
.native-panel :deep(.queue-header > strong) { display: none !important; }
.native-panel :deep(.queue-item-list), .native-panel :deep(#queue-scroll) { scrollbar-width: none; }
.native-panel :deep(.queue-item-list::-webkit-scrollbar), .native-panel :deep(#queue-scroll::-webkit-scrollbar) { display: none; }
.native-panel :deep(.queue-item-list img), .native-panel :deep(#queue-scroll img), .native-panel :deep(.c-listitem img), .native-panel :deep(.ri-list-item img), .native-panel :deep(.artwork img), .native-panel :deep(.q-img__image) { display: block !important; width: 100% !important; height: 100% !important; min-width: 100% !important; min-height: 100% !important; object-fit: cover !important; object-position: center !important; }
.native-panel :deep(.queue-item-list .artwork), .native-panel :deep(#queue-scroll .artwork), .native-panel :deep(.c-listitem .artwork), .native-panel :deep(.ri-list-item .artwork), .native-panel :deep(.artwork-size), .native-panel :deep(.ab-artwork) { overflow: hidden !important; aspect-ratio: 1 !important; }
.lyrics-toolbar { position: absolute; z-index: 4; top: clamp(2rem, 4vh, 3.5rem); left: clamp(1.75rem, 4vw, 4.5rem); right: clamp(1.75rem, 4vw, 4.5rem); display: flex; align-items: center; justify-content: flex-start; gap: .9rem; pointer-events: none; }
.panel-switcher { display: flex; gap: .28rem; padding: .28rem; border: 1px solid rgb(255 255 255 / 9%); border-radius: 1rem; background: rgb(13 12 16 / 52%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 8%), 0 .8rem 2.5rem rgb(0 0 0 / 18%); pointer-events: auto; backdrop-filter: blur(18px) saturate(125%); }
.panel-switcher button { display: flex; min-height: 2.15rem; align-items: center; gap: .42rem; border: 1px solid transparent; border-radius: .72rem; padding: 0 .72rem; color: rgb(255 255 255 / 48%); background: transparent; font: inherit; font-size: .72rem; font-weight: 630; cursor: pointer; transition: color 260ms ease, border-color 260ms ease, background 260ms ease, transform 360ms var(--spring), box-shadow 360ms ease; }
.panel-switcher button:hover { color: rgb(255 255 255 / 88%); background: rgb(255 255 255 / 6%); }
.panel-switcher button:active { transform: scale(.96); }
.panel-switcher button:focus-visible { outline: .13rem solid #fff; outline-offset: .12rem; }
.panel-switcher button.active { color: #fff; border-color: rgb(231 43 66 / 38%); background: rgb(231 43 66 / 68%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 18%), 0 .4rem 1.2rem rgb(126 8 28 / 20%); }
.panel-switcher svg { width: .92rem; height: .92rem; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
.lyrics-actions { display: flex; align-items: center; justify-content: flex-start; gap: .65rem; }
.translation-note { margin: 0; padding: .52rem .72rem; border-radius: 999px; color: rgb(255 255 255 / 58%); background: rgb(255 255 255 / 7%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 8%); font-size: .72rem; }
.source-switch { display: flex; min-height: 2.15rem; align-items: center; gap: .58rem; border: 1px solid rgb(255 255 255 / 9%); border-radius: .78rem; padding: .22rem .28rem .22rem .68rem; color: rgb(255 255 255 / 56%); background: rgb(13 12 16 / 52%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 7%); font-size: .7rem; pointer-events: auto; backdrop-filter: blur(18px) saturate(120%); }
.source-switch button { min-height: 1.65rem; border: 1px solid rgb(231 43 66 / 22%); border-radius: .56rem; padding: 0 .62rem; color: rgb(255 255 255 / 87%); background: rgb(231 43 66 / 52%); font: inherit; font-weight: 680; cursor: pointer; transition: background 220ms ease, transform 340ms var(--spring); }
.source-switch button:hover { background: rgb(231 43 66 / 72%); transform: translateY(-1px); }
.source-switch button:active { transform: scale(.96); }
.source-switch button:focus-visible { outline: .12rem solid #fff; outline-offset: .12rem; }
.panel-view-enter-active, .panel-view-leave-active { transition: opacity 220ms ease, transform 420ms var(--spring); }
.panel-view-enter-from { opacity: 0; transform: translateY(.65rem) scale(.992); }
.panel-view-leave-to { opacity: 0; transform: translateY(-.35rem) scale(.996); }
@media (max-width: 1120px) { .netease-layout { grid-template-columns: minmax(20rem, 39vw) minmax(0, 1fr); } .now-playing::after { left: 39vw; } .now-playing { padding-inline: clamp(1.6rem, 3vw, 2.7rem); } }
@media (max-width: 900px) { .netease-layout { grid-template-columns: 1fr; } .now-playing { position: absolute; z-index: 5; left: .75rem; right: .75rem; bottom: .75rem; display: grid; grid-template-columns: 3.75rem minmax(0, 1fr); gap: .8rem; align-items: center; padding: .62rem .7rem; border: 1px solid rgb(255 255 255 / 9%); border-radius: 1.15rem; background: rgb(13 12 16 / 52%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 11%), 0 1.2rem 4rem rgb(0 0 0 / 28%); -webkit-backdrop-filter: blur(28px) saturate(132%); backdrop-filter: blur(28px) saturate(132%); } .now-playing::after { display: none; } .artwork-shell { grid-row: 1 / 3; width: 3.75rem; padding: .2rem; border-radius: .82rem; } .artwork { border-radius: .63rem; } .metadata { align-self: end; } .metadata h1 { margin: 0 0 .15rem; font-size: 1rem; line-height: 1.15; letter-spacing: -.025em; } .metadata .artist { font-size: .76rem; } .metadata .album { display: none; } .controls { display: none; } .content { padding-bottom: 5.75rem; } .lyrics-toolbar { top: 1.25rem; left: 1rem; right: 1rem; } }
@media (max-width: 560px) { .lyrics-toolbar { justify-content: flex-end; } .translation-note { display: none; } }
@media (max-height: 680px) and (min-width: 901px) { .now-playing { gap: .75rem; padding-block: 2rem 1.5rem; } .artwork-shell { width: min(100%, 47vh, 21rem); } .metadata h1 { font-size: clamp(1.5rem, 2.5vw, 2.35rem); } }
@media (prefers-reduced-motion: reduce) { .artwork :deep(cider-immersive-artwork), .controls :deep(*), .panel-view-enter-active, .panel-view-leave-active { transition-duration: .01ms !important; } }
</style>
