<script setup lang="ts">
import type { TrackCandidate } from "@cider-netease/shared";
import { computed, ref } from "vue";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { lyricController, lyricState } from "../stores/lyric-store";
import { settings } from "../stores/settings-store";
import CustomMatchDialog from "./CustomMatchDialog.vue";

const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey, variables?: Record<string, string | number>) => translate(locale.value, key, variables);
const query = ref("");
const remember = ref(true);
const choosing = ref<string | null>(null);
const customMatchOpen = ref(false);

async function choose(candidate: TrackCandidate) {
  choosing.value = candidate.neteaseId;
  try {
    await lyricController.chooseCandidate(candidate, remember.value);
  } finally {
    choosing.value = null;
  }
}

function percent(score: number): string {
  return `${Math.round(score * 100)}%`;
}
</script>

<template>
  <section class="chooser" :aria-label="t('matchChooser.aria')">
    <header>
      <div>
        <p class="eyebrow">{{ t("matchChooser.kicker") }}</p>
        <h2>{{ t("matchChooser.title") }}</h2>
      </div>
      <label class="remember"><input v-model="remember" type="checkbox" /> {{ t("matchChooser.remember") }}</label>
    </header>

    <form class="search" @submit.prevent="lyricController.manualSearch(query)">
      <input v-model="query" type="search" maxlength="1024" :placeholder="t('matchChooser.searchPlaceholder')" />
      <button type="submit">{{ t("matchChooser.search") }}</button>
    </form>

    <div class="candidate-list">
      <button
        v-for="candidate in lyricState.candidates"
        :key="candidate.neteaseId"
        type="button"
        class="candidate"
        :disabled="choosing !== null"
        @click="choose(candidate)"
      >
        <span class="score" :class="{ warning: candidate.severeVersionConflict }">{{ percent(candidate.score) }}</span>
        <span class="identity">
          <strong>{{ candidate.title }}</strong>
          <span>{{ candidate.artists.join(" / ") }} · {{ candidate.album || t("matchChooser.unknownAlbum") }}</span>
          <small v-if="candidate.versionTags.length">{{ t("matchChooser.versionTags", { tags: candidate.versionTags.join(", ") }) }}</small>
        </span>
        <span class="choose-label">{{ choosing === candidate.neteaseId ? t("matchChooser.loading") : t("matchChooser.use") }}</span>
      </button>
    </div>
    <footer>
      <span>{{ t("matchChooser.rememberHint") }}</span>
      <div class="footer-actions">
        <button type="button" class="link custom-match" @click="customMatchOpen = true">{{ t("status.customMatch") }}</button>
        <button type="button" class="link" @click="lyricController.rematch()">{{ t("matchChooser.clearAndRetry") }}</button>
      </div>
    </footer>
  </section>
  <CustomMatchDialog v-if="customMatchOpen" @close="customMatchOpen = false" />
</template>

<style scoped>
.chooser { width: min(48rem, 100%); max-height: min(72vh, 48rem); display: flex; flex-direction: column; gap: 1rem; padding: 1.35rem; color: white; border: 1px solid rgb(255 255 255 / 14%); border-radius: 1.35rem; background: rgb(9 11 17 / 52%); backdrop-filter: blur(24px); }
header { display: flex; align-items: end; justify-content: space-between; gap: 1rem; }
.eyebrow { margin: 0 0 .25rem; color: rgb(255 255 255 / 52%); font-size: .72rem; font-weight: 800; letter-spacing: .13em; text-transform: uppercase; }
h2 { margin: 0; font-size: clamp(1.25rem, 2vw, 1.75rem); }
.remember { flex: 0 0 auto; color: rgb(255 255 255 / 72%); font-size: .86rem; }
.search { display: grid; grid-template-columns: 1fr auto; gap: .6rem; }
input[type="search"] { min-width: 0; border: 1px solid rgb(255 255 255 / 14%); border-radius: .8rem; padding: .8rem 1rem; color: white; background: rgb(255 255 255 / 8%); outline: none; }
.search button { border: 0; border-radius: .8rem; padding: 0 1.1rem; font-weight: 750; cursor: pointer; }
.candidate-list { min-height: 0; overflow: auto; display: grid; gap: .55rem; }
.candidate { display: grid; grid-template-columns: 3.2rem 1fr auto; gap: .85rem; align-items: center; padding: .85rem; text-align: left; color: white; border: 1px solid transparent; border-radius: 1rem; background: rgb(255 255 255 / 7%); cursor: pointer; }
.candidate:hover { border-color: rgb(255 255 255 / 24%); background: rgb(255 255 255 / 11%); }
.score { display: grid; place-items: center; aspect-ratio: 1; border-radius: 50%; background: rgb(123 232 180 / 16%); color: #aaf5cf; font-size: .78rem; font-weight: 800; }
.score.warning { color: #ffd9a6; background: rgb(255 171 69 / 16%); }
.identity { min-width: 0; display: grid; gap: .18rem; }
.identity strong, .identity span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.identity span, .identity small { color: rgb(255 255 255 / 58%); }
.choose-label { color: rgb(255 255 255 / 68%); font-size: .82rem; font-weight: 750; }
footer { display: flex; justify-content: space-between; gap: 1rem; color: rgb(255 255 255 / 45%); font-size: .78rem; }
.footer-actions { display: flex; flex: 0 0 auto; align-items: center; gap: .5rem; }
.link { min-height: 2.25rem; border: 1px solid transparent; border-radius: .68rem; padding: 0 .72rem; color: rgb(255 255 255 / 68%); background: none; font: inherit; font-weight: 680; cursor: pointer; transition: color 220ms ease, border-color 220ms ease, background 220ms ease, transform 320ms cubic-bezier(.22, 1, .36, 1); }
.link:hover { color: #fff; background: rgb(255 255 255 / 7%); }
.link:active { transform: scale(.96); }
.link:focus-visible { outline: .13rem solid #fff; outline-offset: .13rem; }
.custom-match { border-color: rgb(231 43 66 / 28%); color: rgb(255 255 255 / 88%); background: rgb(231 43 66 / 30%); }
.custom-match:hover { border-color: rgb(255 81 103 / 42%); background: rgb(231 43 66 / 48%); }
@media (max-width: 620px) { header, footer { align-items: start; flex-direction: column; } .footer-actions { width: 100%; flex-wrap: wrap; } .candidate { grid-template-columns: 3rem 1fr; } .choose-label { display: none; } }
</style>
