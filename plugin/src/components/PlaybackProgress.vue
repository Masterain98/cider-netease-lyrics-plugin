<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { canSeekPlayback, getHostAudioElement, getPlaybackTime, seekPlayback } from "../adapters/playback-adapter";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { settings } from "../stores/settings-store";

const props = defineProps<{ durationMs: number | undefined }>();
const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey, variables?: Record<string, string | number>) => translate(locale.value, key, variables);
const currentTime = ref(0);
const draftTime = ref(0);
const dragging = ref(false);
const hostDuration = ref(0);
let frame = 0;
let lastUpdate = 0;

const duration = computed(() => Math.max(0, props.durationMs ? props.durationMs / 1000 : hostDuration.value));
const displayedTime = computed(() => dragging.value ? draftTime.value : currentTime.value);
const remainingTime = computed(() => Math.max(0, duration.value - displayedTime.value));
const progress = computed(() => duration.value > 0 ? Math.min(100, displayedTime.value / duration.value * 100) : 0);
const seekable = computed(() => duration.value > 0 && canSeekPlayback());

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0));
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
}

function tick(timestamp: number) {
  if (!dragging.value && timestamp - lastUpdate >= 100) {
    const detectedDuration = getHostAudioElement()?.duration;
    if (typeof detectedDuration === "number" && Number.isFinite(detectedDuration) && detectedDuration > 0) {
      hostDuration.value = detectedDuration;
    }
    currentTime.value = Math.min(duration.value || Number.POSITIVE_INFINITY, Math.max(0, getPlaybackTime()));
    lastUpdate = timestamp;
  }
  frame = requestAnimationFrame(tick);
}

function beginSeeking() {
  if (!seekable.value) return;
  dragging.value = true;
  draftTime.value = currentTime.value;
}

function previewSeek(event: Event) {
  dragging.value = true;
  draftTime.value = Number.parseFloat((event.currentTarget as HTMLInputElement).value);
}

function commitSeek(event: Event) {
  const nextTime = Number.parseFloat((event.currentTarget as HTMLInputElement).value);
  if (seekable.value && Number.isFinite(nextTime)) seekPlayback(nextTime);
  currentTime.value = Number.isFinite(nextTime) ? nextTime : currentTime.value;
  dragging.value = false;
}

function cancelSeeking() {
  dragging.value = false;
}

onMounted(() => { frame = requestAnimationFrame(tick); });
onBeforeUnmount(() => { cancelAnimationFrame(frame); });
</script>

<template>
  <div class="playback-progress" :class="{ dragging, disabled: !seekable }">
    <time :datetime="`PT${Math.floor(displayedTime)}S`">{{ formatTime(displayedTime) }}</time>
    <div class="progress-track">
      <span class="progress-fill" :style="{ width: `${progress}%` }" aria-hidden="true"></span>
      <input
        type="range"
        min="0"
        :max="duration"
        step="0.1"
        :value="displayedTime"
        :disabled="!seekable"
        :style="{ '--progress': `${progress}%` }"
        :aria-label="t('player.progress')"
        :aria-valuetext="t('player.progressValue', { current: formatTime(displayedTime), remaining: formatTime(remainingTime) })"
        @pointerdown="beginSeeking"
        @pointercancel="cancelSeeking"
        @input="previewSeek"
        @change="commitSeek"
        @blur="cancelSeeking"
      />
    </div>
    <time :datetime="`PT${Math.floor(remainingTime)}S`">-{{ formatTime(remainingTime) }}</time>
  </div>
</template>

<style scoped>
.playback-progress { --spring: cubic-bezier(.22, 1, .36, 1); display: grid; grid-template-columns: 3.25rem minmax(0, 1fr) 3.25rem; gap: .62rem; align-items: center; padding: .25rem 0 .38rem; color: rgb(255 255 255 / 58%); font-size: .69rem; font-variant-numeric: tabular-nums; }
time:last-child { text-align: right; }
.progress-track { position: relative; min-height: .92rem; display: grid; align-items: center; }
.progress-track::before, .progress-fill { position: absolute; left: 0; width: 100%; height: .28rem; border-radius: 999px; content: ""; pointer-events: none; }
.progress-track::before { background: rgb(255 255 255 / 15%); }
.progress-fill { z-index: 1; width: 0; background: linear-gradient(90deg, #ff4058, #ff5369); box-shadow: 0 0 .8rem rgb(231 43 66 / 28%); transition: width 520ms var(--spring), height 420ms var(--spring), box-shadow 420ms ease; }
input { --progress: 0%; position: relative; z-index: 2; appearance: none; width: 100%; height: .92rem; margin: 0; border: 0; border-radius: 999px; outline: none; background: transparent; cursor: pointer; transition: filter 420ms var(--spring); }
input::-webkit-slider-runnable-track { appearance: none; border: 0; background: transparent; }
input::-webkit-slider-thumb { appearance: none; width: .78rem; height: .78rem; border: 0; border-radius: 50%; opacity: 0; background: #fff; box-shadow: 0 0 0 .22rem rgb(231 43 66 / 28%), 0 .22rem .8rem rgb(0 0 0 / 34%); cursor: grab; transform: scale(.68); transition: opacity 280ms var(--spring), transform 420ms var(--spring); }
input::-moz-range-track { height: 100%; border: 0; border-radius: inherit; background: transparent; }
input::-moz-range-progress { height: 100%; border-radius: inherit; background: #ff4058; }
input::-moz-range-thumb { width: .78rem; height: .78rem; border: 0; border-radius: 50%; opacity: 0; background: #fff; box-shadow: 0 0 0 .22rem rgb(231 43 66 / 28%), 0 .22rem .8rem rgb(0 0 0 / 34%); cursor: grab; transform: scale(.68); transition: opacity 280ms var(--spring), transform 420ms var(--spring); }
.progress-track:hover input, input:focus-visible, .dragging input { filter: brightness(1.13); }
.progress-track:hover::before, .progress-track:hover .progress-fill { height: .44rem; }
.dragging .progress-fill { transition-duration: 70ms; box-shadow: 0 0 1.1rem rgb(231 43 66 / 42%); }
.progress-track:hover input::-webkit-slider-thumb, input:focus-visible::-webkit-slider-thumb, .dragging input::-webkit-slider-thumb { opacity: 1; transform: scale(1); }
.progress-track:hover input::-moz-range-thumb, input:focus-visible::-moz-range-thumb, .dragging input::-moz-range-thumb { opacity: 1; transform: scale(1); }
input:active::-webkit-slider-thumb { cursor: grabbing; transform: scale(.9); }
input:focus-visible { outline: .13rem solid rgb(255 255 255 / 88%); outline-offset: .22rem; }
.disabled { opacity: .45; }
.disabled input { cursor: default; }
@media (prefers-reduced-motion: reduce) { input, input::-webkit-slider-thumb, input::-moz-range-thumb { transition-duration: .01ms; } }
</style>
