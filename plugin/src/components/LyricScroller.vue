<script setup lang="ts">
import type { LyricLine } from "@cider-netease/shared";
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { canSeekPlayback, getPlaybackTime, seekPlayback } from "../adapters/playback-adapter";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { settings } from "../stores/settings-store";
import { findCurrentLine } from "../utils/current-line";
import { traditionalLyricsConverter } from "../utils/traditional-lyrics";

const props = defineProps<{ lines: LyricLine[]; translationIsChinese: boolean }>();
const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey) => translate(locale.value, key);
const activeIndex = ref(-1);
const suspended = ref(false);
const lyricsElement = ref<HTMLElement | null>(null);
const lineElements = new Map<number, HTMLElement>();
let frame = 0;
let lastUpdate = 0;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;

const virtualization = computed(() => props.lines.length > 240);
const startIndex = computed(() => (virtualization.value ? Math.max(0, activeIndex.value - 45) : 0));
const endIndex = computed(() => (virtualization.value ? Math.min(props.lines.length, Math.max(activeIndex.value + 70, 115)) : props.lines.length));
const displayLines = computed(() => {
  if (!settings.convertLyricsToTraditional || traditionalLyricsConverter.state.status !== "ready") return props.lines;
  return traditionalLyricsConverter.convertLines(props.lines);
});
const visibleLines = computed(() => displayLines.value.slice(startIndex.value, endIndex.value));
const estimatedHeight = 92;
const topSpacer = computed(() => startIndex.value * estimatedHeight);
const bottomSpacer = computed(() => (props.lines.length - endIndex.value) * estimatedHeight);
const showTranslation = computed(
  () => settings.showTranslation && (!settings.chineseTranslationOnly || props.translationIsChinese),
);
const originalFontStyle = computed(() => ({
  fontSize: `clamp(1.35rem, ${(3.15 * settings.originalFontSize).toFixed(4)}vw, 4.55rem)`,
}));
const translationFontStyle = computed(() => ({
  fontSize: `clamp(.94rem, ${(2.05 * settings.translationFontSize).toFixed(4)}vw, 2rem)`,
  opacity: settings.translationOpacity,
}));

function tick(timestamp: number) {
  if (timestamp - lastUpdate >= 75) {
    activeIndex.value = findCurrentLine(props.lines, getPlaybackTime());
    lastUpdate = timestamp;
  }
  frame = requestAnimationFrame(tick);
}

function setLineElement(element: Element | null, index: number) {
  if (element instanceof HTMLElement) lineElements.set(index, element);
  else lineElements.delete(index);
}

function pauseFollowing() {
  suspended.value = true;
  if (resumeTimer) clearTimeout(resumeTimer);
  resumeTimer = setTimeout(() => {
    suspended.value = false;
    followActiveLine();
  }, 4_000);
}

function followActiveLine() {
  if (!settings.autoScroll || suspended.value || activeIndex.value < 0) return;
  void nextTick(() => {
    const container = lyricsElement.value;
    const line = lineElements.get(activeIndex.value);
    if (!container || !line) return;
    const centeredTop = line.offsetTop - container.clientHeight / 2 + line.offsetHeight / 2;
    container.scrollTo({ top: Math.max(0, centeredTop), behavior: "smooth" });
  });
}

function resumeFollowing() {
  suspended.value = false;
  if (resumeTimer) clearTimeout(resumeTimer);
  followActiveLine();
}

function seek(line: LyricLine) {
  if (settings.allowSeek && canSeekPlayback()) seekPlayback(line.start);
}

watch(activeIndex, followActiveLine);
watch(() => props.lines, () => { activeIndex.value = findCurrentLine(props.lines, getPlaybackTime()); }, { immediate: true });
watch(
  () => settings.convertLyricsToTraditional,
  (enabled) => {
    if (enabled) void traditionalLyricsConverter.load().catch(() => undefined);
  },
  { immediate: true },
);
onMounted(() => { frame = requestAnimationFrame(tick); });
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  if (resumeTimer) clearTimeout(resumeTimer);
  lineElements.clear();
});
</script>

<template>
  <div class="lyrics-shell">
    <button v-if="suspended && settings.autoScroll" class="resume" type="button" @click="resumeFollowing">{{ t("lyrics.resumeFollowing") }}</button>
    <div ref="lyricsElement" class="lyrics" @wheel.passive="pauseFollowing" @touchstart.passive="pauseFollowing" @pointerdown="pauseFollowing">
      <div v-if="topSpacer" :style="{ height: `${topSpacer}px` }" aria-hidden="true" />
      <button
        v-for="(line, visibleIndex) in visibleLines"
        :key="`${line.start}-${line.index ?? visibleIndex}`"
        :ref="(element) => setLineElement(element as Element | null, startIndex + visibleIndex)"
        type="button"
        class="lyric-line"
        :class="{ active: startIndex + visibleIndex === activeIndex, empty: line.empty, credit: line.isCredit }"
        :aria-current="startIndex + visibleIndex === activeIndex ? 'true' : undefined"
        :disabled="!settings.allowSeek || !canSeekPlayback()"
        @click="seek(line)"
      >
        <span v-if="settings.showOriginal" class="original" :style="originalFontStyle">{{ line.text || "·" }}</span>
        <span
          v-if="showTranslation && line.translation"
          class="translation"
          :style="translationFontStyle"
        >{{ line.translation }}</span>
      </button>
      <div v-if="bottomSpacer" :style="{ height: `${bottomSpacer}px` }" aria-hidden="true" />
    </div>
  </div>
</template>

<style scoped>
.lyrics-shell { position: relative; min-height: 0; height: 100%; }
.lyrics { height: 100%; overflow: auto; padding: 42vh clamp(1.25rem, 4vw, 4.75rem); scroll-behavior: smooth; scrollbar-width: none; mask-image: linear-gradient(to bottom, transparent 0, #000 13%, #000 84%, transparent 100%); }
.lyrics::-webkit-scrollbar { display: none; }
.lyric-line { position: relative; width: 100%; display: grid; gap: .24em; margin: .18rem 0; padding: .62rem 1rem .7rem 1.3rem; border: 0; border-radius: 1.15rem; color: inherit; text-align: left; background: transparent; opacity: .27; transform: translateX(0) scale(.955); transform-origin: left center; transition: opacity 520ms cubic-bezier(.22, 1, .36, 1), transform 620ms cubic-bezier(.22, 1, .36, 1), background 520ms cubic-bezier(.22, 1, .36, 1), box-shadow 520ms cubic-bezier(.22, 1, .36, 1); cursor: pointer; }
.lyric-line::before { content: ""; position: absolute; top: 18%; bottom: 18%; left: .28rem; width: .2rem; border-radius: 999px; background: #ff4058; box-shadow: 0 0 1.4rem rgb(231 43 66 / 60%); opacity: 0; transform: scaleY(.35); transition: opacity 420ms cubic-bezier(.22, 1, .36, 1), transform 520ms cubic-bezier(.22, 1, .36, 1); }
.lyric-line:hover { opacity: .72; transform: translateX(.42rem) scale(.97); background: linear-gradient(90deg, rgb(231 43 66 / 10%), rgb(255 255 255 / 4%) 58%, transparent); }
.lyric-line:focus-visible { outline: .12rem solid rgb(255 255 255 / 82%); outline-offset: .15rem; opacity: .86; }
.lyric-line.active { opacity: 1; transform: translateX(.55rem) scale(1); background: linear-gradient(90deg, rgb(231 43 66 / 14%), rgb(255 255 255 / 3%) 54%, transparent); box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%); }
.lyric-line.active::before { opacity: 1; transform: scaleY(1); }
.lyric-line.empty { min-height: 1.25rem; padding-block: .15rem; pointer-events: none; }
.lyric-line.credit { opacity: .24; }
.original { font-size: clamp(1.35rem, 3.15vw, 4.55rem); font-weight: 720; line-height: 1.16; letter-spacing: -.035em; text-wrap: balance; }
.translation { display: block; font-size: clamp(.94rem, 1.271vw, 2rem); font-weight: 560; line-height: 1.42; letter-spacing: .005em; color: rgb(255 255 255 / 66%); }
.active .translation { color: rgb(255 255 255 / 78%); }
.resume { position: absolute; z-index: 5; top: clamp(4.7rem, 9vh, 6.3rem); left: 50%; transform: translateX(-50%); border: 0; border-radius: 999px; padding: .6rem .92rem; color: white; background: rgb(231 43 66 / 84%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 19%), 0 .8rem 2.8rem rgb(126 8 28 / 24%); font: inherit; font-size: .74rem; font-weight: 620; cursor: pointer; transition: transform 480ms cubic-bezier(.22, 1, .36, 1), background 360ms cubic-bezier(.22, 1, .36, 1); }
.resume:hover { transform: translateX(-50%) translateY(-2px); background: #ef334b; }
.resume:active { transform: translateX(-50%) scale(.97); }
.resume:focus-visible { outline: .14rem solid #fff; outline-offset: .18rem; }
@media (max-width: 760px) { .lyrics { padding-inline: 1rem; } .lyric-line { padding-inline: 1rem; text-align: center; transform-origin: center; } .lyric-line::before { display: none; } .lyric-line:hover, .lyric-line.active { transform: scale(1); background: rgb(255 255 255 / 5%); } }
@media (prefers-reduced-motion: reduce) { .lyrics { scroll-behavior: auto; } .lyric-line { transition: none; } }
</style>
