<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { lyricController, lyricState } from "../stores/lyric-store";
import { settings } from "../stores/settings-store";
import TrackMetadataPanel from "./TrackMetadataPanel.vue";

const customOpen = ref(false);
const metadataOpen = ref(false);
const quickTools = ref<HTMLElement>();
const metadataButton = ref<HTMLButtonElement>();
const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey, variables?: Record<string, string | number>) => translate(locale.value, key, variables);
const lyricSize = computed(() => Math.round(settings.originalFontSize * 100));
const translationSize = computed(() => Math.round(settings.translationFontSize * 100));
const traditionalGlyph = computed(() => settings.convertLyricsToTraditional ? "\u7E41" : "\u7B80");
const busy = computed(() => ["resolving-track", "searching", "fetching-lyrics"].includes(lyricState.status));
const minimumOriginalSize = 0.8;
const maximumOriginalSize = 1.2;
const minimumTranslationSize = 0.45;
const maximumTranslationSize = 0.9;

function clampSize(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, Number(value.toFixed(2))));
}

function adjustSize(delta: number) {
  settings.originalFontSize = clampSize(settings.originalFontSize + delta, minimumOriginalSize, maximumOriginalSize);
}

function adjustOriginalSize(delta: number) {
  settings.originalFontSize = clampSize(settings.originalFontSize + delta, minimumOriginalSize, maximumOriginalSize);
}

function adjustTranslationSize(delta: number) {
  settings.translationFontSize = clampSize(settings.translationFontSize + delta, minimumTranslationSize, maximumTranslationSize);
}

function resetSizes() {
  settings.originalFontSize = 1;
  settings.translationFontSize = 0.62;
}

function close() {
  customOpen.value = false;
  closeMetadata();
}

function closeMetadata({ restoreFocus = true }: { restoreFocus?: boolean } = {}) {
  if (!metadataOpen.value) return;
  metadataOpen.value = false;
  if (restoreFocus) void nextTick(() => metadataButton.value?.focus());
}

function toggleMetadata() {
  metadataOpen.value = !metadataOpen.value;
  if (metadataOpen.value) customOpen.value = false;
}

function openCustomize() {
  closeMetadata({ restoreFocus: false });
  customOpen.value = !customOpen.value;
}

function onDocumentPointerDown(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Node) || !metadataOpen.value) return;
  if (quickTools.value && !quickTools.value.contains(target)) close();
}

function onDocumentKeyDown(event: KeyboardEvent) {
  if (event.key !== "Escape" || !metadataOpen.value) return;
  event.stopPropagation();
  close();
}

onMounted(() => {
  document.addEventListener("pointerdown", onDocumentPointerDown);
  document.addEventListener("keydown", onDocumentKeyDown);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", onDocumentPointerDown);
  document.removeEventListener("keydown", onDocumentKeyDown);
});
</script>

<template>
  <aside ref="quickTools" class="quick-tools" :aria-label="t('quickTools.open')" @keydown.esc="close">
    <nav class="tool-rail" :aria-label="t('quickTools.open')">
      <button
        type="button"
        class="tool-button size-button"
        :data-tooltip="t('quickTools.smaller', { size: lyricSize })"
        :aria-label="t('quickTools.smaller', { size: lyricSize })"
        :disabled="settings.originalFontSize <= minimumOriginalSize"
        @click="adjustSize(-0.05)"
      ><span aria-hidden="true">A−</span></button>
      <button
        type="button"
        class="tool-button size-button"
        :data-tooltip="t('quickTools.larger', { size: lyricSize })"
        :aria-label="t('quickTools.larger', { size: lyricSize })"
        :disabled="settings.originalFontSize >= maximumOriginalSize"
        @click="adjustSize(0.05)"
      ><span aria-hidden="true">A＋</span></button>

      <span class="divider" aria-hidden="true"></span>

      <button
        type="button"
        class="tool-button glyph-button"
        :class="{ active: settings.showTranslation }"
        :data-tooltip="t('quickTools.translation')"
        :aria-label="t('quickTools.translation')"
        :aria-pressed="settings.showTranslation"
        @click="settings.showTranslation = !settings.showTranslation"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24">
          <path d="M4 5h9M8.5 3v2M6 8c1.2 2.5 3.3 4.4 6 5.6M11 8c-.9 2.2-2.8 4.3-5.8 6" />
          <path d="m14 19 3.2-8 3.2 8M15.2 16h4" />
        </svg>
      </button>
      <button
        type="button"
        class="tool-button glyph-button text-glyph-button"
        :data-tooltip="settings.convertLyricsToTraditional ? t('quickTools.switchToSimplified') : t('quickTools.switchToTraditional')"
        :aria-label="settings.convertLyricsToTraditional ? t('quickTools.switchToSimplified') : t('quickTools.switchToTraditional')"
        :aria-pressed="settings.convertLyricsToTraditional"
        @click="settings.convertLyricsToTraditional = !settings.convertLyricsToTraditional"
      ><span aria-hidden="true">{{ traditionalGlyph }}</span></button>
      <button
        ref="metadataButton"
        type="button"
        class="tool-button glyph-button"
        :class="{ active: metadataOpen }"
        :data-tooltip="t('quickTools.metadata')"
        :aria-label="t('quickTools.metadata')"
        :aria-expanded="metadataOpen"
        @click="toggleMetadata"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M6 4.5h9l3 3V19.5H6zM15 4.5v3h3M9 11h6M9 14h6M9 17h4" /></svg>
      </button>
      <button
        type="button"
        class="tool-button customize-button"
        :class="{ active: customOpen }"
        :data-tooltip="t('quickTools.customize')"
        :aria-label="t('quickTools.customize')"
        :aria-expanded="customOpen"
        @click="openCustomize"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M9.59356 3.94014C9.68397 3.39768 10.1533 3.00009 10.7033 3.00009H13.2972C13.8472 3.00009 14.3165 3.39768 14.4069 3.94014L14.6204 5.22119C14.6828 5.59523 14.9327 5.9068 15.2645 6.09045C15.3387 6.13151 15.412 6.17393 15.4844 6.21766C15.8095 6.41393 16.2048 6.47495 16.5604 6.34175L17.7772 5.88587C18.2922 5.69293 18.8712 5.9006 19.1462 6.37687L20.4432 8.6233C20.7181 9.09957 20.6085 9.70482 20.1839 10.0544L19.1795 10.8812C18.887 11.122 18.742 11.4938 18.7491 11.8726C18.7498 11.915 18.7502 11.9575 18.7502 12.0001C18.7502 12.0427 18.7498 12.0852 18.7491 12.1275C18.742 12.5064 18.887 12.8782 19.1795 13.119L20.1839 13.9458C20.6085 14.2953 20.7181 14.9006 20.4432 15.3769L19.1462 17.6233C18.8712 18.0996 18.2922 18.3072 17.7772 18.1143L16.5604 17.6584C16.2048 17.5252 15.8095 17.5862 15.4844 17.7825C15.412 17.8263 15.3387 17.8687 15.2645 17.9097C14.9327 18.0934 14.6827 18.405 14.6204 18.779L14.4069 20.06C14.3165 20.6025 13.8472 21.0001 13.2972 21.0001H10.7033C10.1533 21.0001 9.68397 20.6025 9.59356 20.06L9.38005 18.779C9.31771 18.4049 9.06774 18.0934 8.73597 17.9097C8.66179 17.8687 8.58847 17.8263 8.51604 17.7825C8.19101 17.5863 7.79568 17.5252 7.44011 17.6584L6.22325 18.1143C5.70826 18.3072 5.12926 18.0996 4.85429 17.6233L3.55731 15.3769C3.28234 14.9006 3.39199 14.2954 3.81657 13.9458L4.82092 13.119C5.11343 12.8782 5.25843 12.5064 5.25141 12.1276C5.25063 12.0852 5.25023 12.0427 5.25023 12.0001C5.25023 11.9575 5.25063 11.915 5.25141 11.8726C5.25843 11.4938 5.11343 11.122 4.82092 10.8812L3.81657 10.0544C3.39199 9.70484 3.28234 9.09958 3.55731 8.62332L4.85429 6.37688C5.12926 5.90061 5.70825 5.69295 6.22325 5.88588L7.4401 6.34176C7.79566 6.47496 8.19099 6.41394 8.51603 6.21767C8.58846 6.17393 8.66179 6.13151 8.73597 6.09045C9.06774 5.9068 9.31771 5.59523 9.38005 5.22119L9.59356 3.94014Z" /><path d="M15 12C15 13.6569 13.6569 15 12 15C10.3431 15 9 13.6569 9 12C9 10.3432 10.3431 9.00001 12 9.00001C13.6569 9.00001 15 10.3432 15 12Z" /></svg>
      </button>
      <button
        type="button"
        class="tool-button"
        :class="{ active: settings.autoScroll }"
        :data-tooltip="t('quickTools.follow')"
        :aria-label="t('quickTools.follow')"
        :aria-pressed="settings.autoScroll"
        @click="settings.autoScroll = !settings.autoScroll"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M12 4v16m0 0-4-4m4 4 4-4M7 7.5a6.8 6.8 0 0 1 10 0" /></svg>
      </button>

      <span class="divider" aria-hidden="true"></span>

      <button
        v-if="lyricState.track"
        type="button"
        class="tool-button rematch-button"
        :class="{ busy }"
        :data-tooltip="busy ? t('quickTools.rematching') : t('quickTools.rematch')"
        :aria-label="busy ? t('quickTools.rematching') : t('quickTools.rematch')"
        :disabled="busy"
        @click="lyricController.rematch()"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M20 11a8.1 8.1 0 0 0-14.9-4.3L3 9m0 0V4m0 5h5m-4 4a8.1 8.1 0 0 0 14.9 4.3L21 15m0 0v5m0-5h-5" /></svg>
      </button>
    </nav>

    <TrackMetadataPanel
      v-if="metadataOpen"
      :track="lyricState.track"
      @close="close"
    />

    <section v-if="customOpen" class="custom-panel" :aria-label="t('quickTools.customizeTitle')">
      <header class="custom-panel-header">
        <div>
          <span class="custom-panel-kicker">NETEASE LYRICS</span>
          <h2>{{ t('quickTools.customizeTitle') }}</h2>
        </div>
        <button type="button" class="custom-close" :aria-label="t('quickTools.closeCustomize')" @click="customOpen = false">×</button>
      </header>

      <div class="custom-control">
        <div class="custom-control-heading"><span>{{ t('lyrics.lyricSize') }}</span><strong>{{ lyricSize }}%</strong></div>
        <div class="custom-range-row">
          <button type="button" :aria-label="t('control.decrease')" :disabled="settings.originalFontSize <= minimumOriginalSize" @click="adjustOriginalSize(-0.05)">−</button>
          <input v-model.number="settings.originalFontSize" type="range" min="0.8" max="1.2" step="0.05" :aria-label="t('lyrics.lyricSize')" />
          <button type="button" :aria-label="t('control.increase')" :disabled="settings.originalFontSize >= maximumOriginalSize" @click="adjustOriginalSize(0.05)">＋</button>
        </div>
      </div>

      <div class="custom-control">
        <div class="custom-control-heading"><span>{{ t('lyrics.fontSize') }}</span><strong>{{ translationSize }}%</strong></div>
        <div class="custom-range-row">
          <button type="button" :aria-label="t('control.decrease')" :disabled="settings.translationFontSize <= minimumTranslationSize" @click="adjustTranslationSize(-0.05)">−</button>
          <input v-model.number="settings.translationFontSize" type="range" min="0.45" max="0.9" step="0.05" :aria-label="t('lyrics.fontSize')" />
          <button type="button" :aria-label="t('control.increase')" :disabled="settings.translationFontSize >= maximumTranslationSize" @click="adjustTranslationSize(0.05)">＋</button>
        </div>
      </div>

      <button type="button" class="custom-reset" @click="resetSizes">{{ t('quickTools.reset') }}</button>
    </section>
  </aside>
</template>

<style scoped>
.quick-tools {
  --rail-red: #e72b42;
  --rail-spring: cubic-bezier(.22, 1, .36, 1);
  position: absolute;
  z-index: 8;
  top: auto;
  right: clamp(.6rem, 1.6vw, 1.5rem);
  bottom: clamp(1.5rem, 5vh, 3.75rem);
  display: block;
  box-sizing: border-box;
  width: 3.25rem;
  padding: .34rem .3rem;
  border: 1px solid rgb(255 255 255 / 8%);
  border-radius: 1.8rem;
  background: rgb(255 255 255 / 2.5%);
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 7%), 0 .8rem 2.5rem rgb(0 0 0 / 18%);
  align-self: start;
  align-items: center;
  justify-self: end;
  overflow: visible;
  transform: none;
  -webkit-backdrop-filter: blur(18px) saturate(115%);
  backdrop-filter: blur(18px) saturate(115%);
}
.tool-rail { display: grid; justify-items: center; gap: .14rem; width: 100%; padding: 0; }
.tool-button { position: relative; display: grid; width: 2.65rem; height: 2.65rem; place-items: center; border: 1px solid transparent; border-radius: 50%; padding: 0; color: rgb(255 255 255 / 86%); background: transparent; opacity: .68; font: inherit; cursor: pointer; transition: color 260ms ease, opacity 260ms ease, border-color 260ms ease, background 260ms ease, transform 380ms var(--rail-spring), box-shadow 380ms ease; }
.tool-button:hover, .tool-button:focus-visible { color: white; border-color: rgb(255 255 255 / 28%); background: rgb(255 255 255 / 9%); opacity: 1; transform: scale(1.05); box-shadow: 0 .45rem 1.4rem rgb(3 3 8 / 18%); }
.tool-button:active { transform: scale(.93); }
.tool-button:focus-visible { outline: .13rem solid white; outline-offset: .15rem; }
.tool-button.active { color: rgb(255 255 255 / 90%); border-color: rgb(231 43 66 / 68%); background: transparent; opacity: .58; box-shadow: 0 0 .7rem rgb(231 43 66 / 14%); }
.tool-button.active:hover, .tool-button.active:focus-visible { opacity: 1; border-color: rgb(231 43 66 / 92%); background: transparent; box-shadow: 0 .45rem 1.25rem rgb(126 8 28 / 24%); }
.tool-button:disabled { opacity: .24; cursor: default; transform: none; }
.tool-button::before { position: absolute; top: 50%; right: calc(100% + .7rem); max-width: 14rem; padding: .46rem .62rem; border: 1px solid rgb(255 255 255 / 9%); border-radius: .6rem; color: rgb(255 255 255 / 86%); background: rgb(13 12 16 / 88%); box-shadow: 0 .7rem 2rem rgb(0 0 0 / 24%); content: attr(data-tooltip); font-size: .68rem; font-weight: 620; line-height: 1.3; opacity: 0; pointer-events: none; transform: translate(.35rem, -50%); white-space: nowrap; backdrop-filter: blur(14px); transition: opacity 180ms ease, transform 280ms var(--rail-spring); }
.tool-button:hover::before, .tool-button:focus-visible::before { opacity: 1; transform: translate(0, -50%); }
.size-button span { font-size: .68rem; font-weight: 680; letter-spacing: -.03em; }
.glyph-button span { font-family: Pretendard, "Segoe UI", sans-serif; font-size: .94rem; font-weight: 620; }
.tool-button svg { width: 1.08rem; height: 1.08rem; fill: none; stroke: currentColor; stroke-width: 1.65; stroke-linecap: round; stroke-linejoin: round; }
.customize-button svg { width: 1.18rem; height: 1.18rem; stroke-width: 1.45; }
.rematch-button:hover svg { transform: rotate(-38deg); transition: transform 520ms var(--rail-spring); }
.rematch-button.busy svg { animation: spin 1.1s linear infinite; }
.divider { width: 1.2rem; height: 1px; margin-block: .2rem; background: rgb(255 255 255 / 12%); }
.custom-panel { position: absolute; z-index: 4; top: 50%; right: 3.85rem; display: grid; width: min(17rem, calc(100vw - 6rem)); gap: 1rem; box-sizing: border-box; padding: 1rem; border: 1px solid rgb(255 255 255 / 13%); border-radius: 1.25rem; color: rgb(255 255 255 / 86%); background: rgb(13 12 16 / 91%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 12%), 0 1.4rem 4rem rgb(0 0 0 / 38%); transform: translateY(-50%); backdrop-filter: blur(24px) saturate(135%); }
.custom-panel::after { position: absolute; top: 50%; right: -.42rem; width: .78rem; height: .78rem; border-top: 1px solid rgb(255 255 255 / 13%); border-right: 1px solid rgb(255 255 255 / 13%); background: rgb(13 12 16 / 91%); content: ""; transform: translateY(-50%) rotate(45deg); }
.custom-panel-header { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; }
.custom-panel-kicker { color: rgb(255 255 255 / 42%); font-size: .58rem; font-weight: 760; letter-spacing: .14em; }
.custom-panel h2 { margin: .28rem 0 0; color: #fff; font-size: .98rem; font-weight: 720; letter-spacing: -.02em; }
.custom-close { display: grid; width: 1.8rem; height: 1.8rem; place-items: center; border: 1px solid rgb(255 255 255 / 11%); border-radius: 50%; padding: 0; color: rgb(255 255 255 / 68%); background: rgb(255 255 255 / 5%); font-size: 1.05rem; line-height: 1; }
.custom-close:hover { color: #fff; background: rgb(231 43 66 / 68%); transform: none; }
.custom-control { display: grid; gap: .48rem; }
.custom-control-heading { display: flex; align-items: center; justify-content: space-between; gap: .8rem; color: rgb(255 255 255 / 66%); font-size: .72rem; font-weight: 620; }
.custom-control-heading strong { color: #fff; font-variant-numeric: tabular-nums; }
.custom-range-row { display: grid; grid-template-columns: 1.7rem minmax(0, 1fr) 1.7rem; align-items: center; gap: .45rem; }
.custom-range-row button { display: grid; width: 1.7rem; height: 1.7rem; place-items: center; border: 1px solid rgb(255 255 255 / 10%); border-radius: .55rem; padding: 0; color: rgb(255 255 255 / 65%); background: rgb(255 255 255 / 6%); font: inherit; line-height: 1; }
.custom-range-row button:hover:not(:disabled) { color: #fff; border-color: rgb(231 43 66 / 42%); background: rgb(231 43 66 / 68%); transform: none; }
.custom-range-row button:disabled { opacity: .25; cursor: default; }
.custom-range-row input[type="range"] { width: 100%; height: 1.2rem; margin: 0; accent-color: var(--rail-red); }
.custom-range-row input[type="range"]::-webkit-slider-runnable-track { height: .25rem; border-radius: 999px; background: rgb(255 255 255 / 16%); }
.custom-range-row input[type="range"]::-webkit-slider-thumb { width: .82rem; height: .82rem; margin-top: -.285rem; appearance: none; border: .16rem solid rgb(255 255 255 / 30%); border-radius: 50%; background: var(--rail-red); box-shadow: 0 .2rem .8rem rgb(231 43 66 / 40%); }
.custom-range-row input[type="range"]::-moz-range-track { height: .25rem; border-radius: 999px; background: rgb(255 255 255 / 16%); }
.custom-range-row input[type="range"]::-moz-range-progress { height: .25rem; border-radius: 999px; background: var(--rail-red); }
.custom-range-row input[type="range"]::-moz-range-thumb { width: .55rem; height: .55rem; border: .16rem solid rgb(255 255 255 / 30%); border-radius: 50%; background: var(--rail-red); }
.custom-reset { justify-self: start; margin-top: .05rem; padding: .28rem .48rem; color: rgb(255 255 255 / 52%); background: transparent; font-size: .68rem; font-weight: 620; }
.custom-reset:hover { color: #fff; background: rgb(255 255 255 / 7%); transform: none; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .quick-tools { right: .55rem; bottom: clamp(5.75rem, 10vh, 7rem); width: 3.1rem; padding-inline: .3rem; } .tool-button { width: 2.5rem; height: 2.5rem; } .custom-panel { right: 3.55rem; width: min(16.5rem, calc(100vw - 5rem)); } }
@media (prefers-reduced-motion: reduce) { .tool-button { transition-duration: .01ms !important; } .rematch-button.busy svg { animation-duration: 1.8s; } }
</style>
