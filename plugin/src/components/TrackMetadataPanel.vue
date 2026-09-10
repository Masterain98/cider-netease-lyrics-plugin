<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { TrackQuery } from "@cider-netease/shared";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { lyricState } from "../stores/lyric-store";
import { settings } from "../stores/settings-store";
import { metadataFromMediaItem, trackMetadataService, type TrackMetadata } from "../utils/track-metadata";
import { readCurrentMediaItem } from "../adapters/cider-track-adapter";

const emit = defineEmits<{ close: [] }>();
const props = defineProps<{ track: TrackQuery | null }>();
const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey) => translate(locale.value, key);
const metadata = ref<TrackMetadata>(metadataFromMediaItem(readCurrentMediaItem(), props.track));
const status = ref<"loading" | "ready" | "error">("loading");
const requestError = ref(false);
let loadGeneration = 0;

const identity = computed(() => {
  const track = props.track;
  return [track?.appleMusicId, track?.title, track?.artist, track?.album, track?.durationMs].join("|");
});

const fields = computed(() => [
  { key: "title", label: t("metadata.title"), value: metadata.value.title },
  { key: "artist", label: t("metadata.artist"), value: metadata.value.artist },
  { key: "album", label: t("metadata.album"), value: metadata.value.album },
  { key: "composer", label: t("metadata.composer"), value: metadata.value.composer },
  { key: "genres", label: t("metadata.genres"), value: metadata.value.genres?.join(" · ") },
  { key: "releaseDate", label: t("metadata.releaseDate"), value: metadata.value.releaseDate ? formatDate(metadata.value.releaseDate) : undefined },
  { key: "trackNumber", label: t("metadata.trackNumber"), value: metadata.value.trackNumber?.toString() },
  { key: "discNumber", label: t("metadata.discNumber"), value: metadata.value.discNumber?.toString() },
  { key: "duration", label: t("metadata.duration"), value: metadata.value.durationMs ? formatDuration(metadata.value.durationMs) : undefined },
  { key: "isrc", label: t("metadata.isrc"), value: metadata.value.isrc },
  { key: "appleMusicId", label: t("metadata.appleMusicId"), value: metadata.value.appleMusicId },
  { key: "neteaseId", label: t("metadata.neteaseId"), value: lyricState.diagnostics.selectedNeteaseId ?? undefined },
  { key: "source", label: t("metadata.source"), value: t("metadata.sourceNetease") },
  { key: "matchStatus", label: t("metadata.matchStatus"), value: matchStatus.value },
  { key: "contentRating", label: t("metadata.contentRating"), value: metadata.value.contentRating },
  { key: "hasLyrics", label: t("metadata.hasLyrics"), value: metadata.value.hasLyrics === undefined ? undefined : metadata.value.hasLyrics ? t("metadata.yes") : t("metadata.no") },
  { key: "audioTraits", label: t("metadata.audioTraits"), value: metadata.value.audioTraits?.join(" · ") },
].filter((field): field is { key: string; label: string; value: string } => Boolean(field.value)));

const matchStatus = computed(() => {
  if (lyricState.status === "ready") return t("metadata.matched");
  if (lyricState.status === "selecting-candidate") return t("metadata.awaitingMatch");
  if (lyricState.status === "no-match") return t("metadata.noMatch");
  return t("metadata.notReady");
});

function formatDuration(durationMs: number): string {
  const totalSeconds = Math.round(durationMs / 1_000);
  return `${Math.floor(totalSeconds / 60)}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale.value, { dateStyle: "medium" }).format(date);
}

async function loadMetadata(): Promise<void> {
  const generation = ++loadGeneration;
  metadata.value = metadataFromMediaItem(readCurrentMediaItem(), props.track);
  requestError.value = false;
  status.value = "loading";
  if (!props.track) {
    status.value = "ready";
    return;
  }
  try {
    const loaded = await trackMetadataService.load(props.track);
    if (generation !== loadGeneration) return;
    metadata.value = loaded;
    status.value = "ready";
  } catch {
    if (generation !== loadGeneration) return;
    requestError.value = true;
    status.value = "error";
  }
}

watch(identity, () => { void loadMetadata(); });
onMounted(() => { void loadMetadata(); });
onBeforeUnmount(() => { loadGeneration += 1; requestError.value = false; });
</script>

<template>
  <section class="metadata-panel" role="dialog" :aria-label="t('metadata.panelTitle')" @click.stop>
    <header class="metadata-header">
      <div>
        <span class="metadata-kicker">{{ t("metadata.kicker") }}</span>
        <h2>{{ t("metadata.panelTitle") }}</h2>
      </div>
      <button type="button" class="metadata-close" :aria-label="t('metadata.close')" @click="emit('close')">×</button>
    </header>

    <div v-if="status === 'loading'" class="metadata-state" role="status">
      <span class="metadata-spinner" aria-hidden="true"></span>
      <span>{{ t("metadata.loading") }}</span>
    </div>
    <div v-else-if="status === 'error'" class="metadata-state error" role="alert">
      <span>{{ t("metadata.error") }}</span>
      <button type="button" @click="loadMetadata">{{ t("metadata.retry") }}</button>
    </div>
    <dl v-else-if="fields.length" class="metadata-list">
      <template v-for="field in fields" :key="field.key">
        <dt>{{ field.label }}</dt>
        <dd>{{ field.value }}</dd>
      </template>
    </dl>
    <p v-else class="metadata-state" role="status">{{ t("metadata.empty") }}</p>

    <p v-if="requestError" class="metadata-footnote">{{ t("metadata.partial") }}</p>
  </section>
</template>

<style scoped>
.metadata-panel { position: absolute; z-index: 6; top: 50%; right: 4.45rem; display: grid; width: min(22rem, calc(100vw - 6rem)); max-height: min(35rem, calc(100% - 2rem)); gap: .8rem; box-sizing: border-box; overflow: auto; padding: 1rem; border: 1px solid rgb(255 255 255 / 13%); border-radius: 1.25rem; color: rgb(255 255 255 / 86%); background: rgb(13 12 16 / 93%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 12%), 0 1.4rem 4rem rgb(0 0 0 / 38%); transform: translateY(-50%); backdrop-filter: blur(24px) saturate(135%); scrollbar-width: thin; }
.metadata-panel::after { position: absolute; top: 50%; right: -.42rem; width: .78rem; height: .78rem; border-top: 1px solid rgb(255 255 255 / 13%); border-right: 1px solid rgb(255 255 255 / 13%); background: rgb(13 12 16 / 93%); content: ""; transform: translateY(-50%) rotate(45deg); }
.metadata-header { display: flex; align-items: flex-start; justify-content: space-between; gap: .75rem; }
.metadata-kicker { color: rgb(255 255 255 / 42%); font-size: .58rem; font-weight: 760; letter-spacing: .14em; }
.metadata-header h2 { margin: .28rem 0 0; color: #fff; font-size: .98rem; font-weight: 720; letter-spacing: -.02em; }
.metadata-close { display: grid; width: 1.8rem; height: 1.8rem; place-items: center; border: 1px solid rgb(255 255 255 / 11%); border-radius: 50%; padding: 0; color: rgb(255 255 255 / 68%); background: rgb(255 255 255 / 5%); font: inherit; font-size: 1.05rem; line-height: 1; cursor: pointer; }
.metadata-close:hover { color: #fff; background: rgb(231 43 66 / 68%); }
.metadata-close:focus-visible, .metadata-state button:focus-visible { outline: .13rem solid white; outline-offset: .15rem; }
.metadata-list { display: grid; grid-template-columns: minmax(6rem, .8fr) minmax(0, 1.2fr); gap: .42rem .72rem; margin: 0; font-size: .7rem; line-height: 1.35; }
.metadata-list dt { color: rgb(255 255 255 / 44%); }
.metadata-list dd { min-width: 0; margin: 0; overflow-wrap: anywhere; color: rgb(255 255 255 / 86%); font-weight: 590; }
.metadata-state { display: flex; align-items: center; gap: .55rem; margin: 0; color: rgb(255 255 255 / 55%); font-size: .72rem; line-height: 1.45; }
.metadata-state.error { display: grid; gap: .6rem; color: rgb(255 210 214 / 84%); }
.metadata-state button { justify-self: start; min-height: 2rem; border: 1px solid rgb(231 43 66 / 28%); border-radius: .62rem; padding: 0 .68rem; color: #fff; background: rgb(231 43 66 / 58%); font: inherit; font-size: .7rem; font-weight: 680; cursor: pointer; }
.metadata-state button:hover { background: rgb(231 43 66 / 76%); }
.metadata-spinner { width: .8rem; height: .8rem; border: .12rem solid rgb(255 255 255 / 22%); border-top-color: #ff4058; border-radius: 50%; animation: spin 800ms linear infinite; }
.metadata-footnote { margin: 0; color: rgb(255 255 255 / 38%); font-size: .64rem; line-height: 1.4; }
@keyframes spin { to { transform: rotate(360deg); } }
@media (max-width: 900px) { .metadata-panel { right: 3.7rem; width: min(19rem, calc(100vw - 5rem)); } }
@media (prefers-reduced-motion: reduce) { .metadata-spinner { animation-duration: 1.8s; } }
</style>
