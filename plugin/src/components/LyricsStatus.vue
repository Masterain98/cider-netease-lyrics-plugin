<script setup lang="ts">
import { computed, ref } from "vue";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { lyricController, lyricState } from "../stores/lyric-store";
import { settings } from "../stores/settings-store";
import CustomMatchDialog from "./CustomMatchDialog.vue";

const customMatchOpen = ref(false);
const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey) => translate(locale.value, key);
const nativeAppleLyricsAvailable = Boolean(customElements.get("cider-immersive-lyric-view"));

const message = computed(() => {
  if (!lyricState.track) return t("status.waiting");
  if (!settings.autoMatch && lyricState.status === "idle") return t("status.autoDisabled");
  if (lyricState.diagnostics.lastErrorCode === "INCOMPATIBLE_HOST") return t("status.incompatibleHost");
  const messages: Partial<Record<typeof lyricState.status, string>> = {
    "resolving-track": t("status.resolving"),
    searching: t("status.searching"),
    "fetching-lyrics": t("status.fetching"),
    "no-match": t("status.noMatch"),
    "no-lyrics": t("status.noLyrics"),
    timeout: t("status.timeout"),
    "rate-limited": t("status.rateLimited"),
    "service-error": settings.connectionMode === "direct"
      ? t("status.directError")
      : t("status.gatewayError"),
    cancelled: t("status.cancelled"),
  };
  return messages[lyricState.status] ?? t("status.default");
});

const busy = computed(() => ["resolving-track", "searching", "fetching-lyrics"].includes(lyricState.status));
</script>

<template>
  <section class="status-card" aria-live="polite">
    <div class="status-mark" :class="{ busy }" aria-hidden="true">{{ busy ? "···" : "♪" }}</div>
    <div>
      <h2>{{ busy ? t("status.headingBusy") : t("status.heading") }}</h2>
      <p>{{ message }}</p>
      <div class="actions" v-if="!busy && lyricState.track">
        <button type="button" class="primary" @click="lyricController.retry()">{{ settings.autoMatch ? t("status.retry") : t("status.matchCurrent") }}</button>
        <button
          v-if="['no-match', 'no-lyrics', 'service-error'].includes(lyricState.status)"
          type="button"
          class="secondary"
          @click="lyricController.rematch()"
        >{{ t("status.rematch") }}</button>
        <button type="button" class="secondary" @click="customMatchOpen = true">{{ t("status.customMatch") }}</button>
        <button
          type="button"
          class="apple-action"
          :disabled="!nativeAppleLyricsAvailable"
          @click="lyricController.useAppleMusicLyrics()"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M16.8 3.2c-.9.1-2 .7-2.6 1.4-.6.7-1.1 1.8-.9 2.8 1 .1 2-.5 2.6-1.2.6-.8 1-1.9.9-3ZM20 16.2c-.5 1.2-.8 1.8-1.5 2.9-1 1.5-2.4 3.3-4.1 3.3-1.5 0-1.9-1-4-1s-2.6 1-4.1 1c-1.7 0-3-1.6-4-3.1-2.8-4.2-3.1-9.1-1.4-11.7 1.2-1.8 3.2-2.8 5-2.8 1.9 0 3.1 1 4.6 1 1.4 0 2.3-1 4.5-1 1.7 0 3.4.9 4.6 2.5-4 2.2-3.4 7.9.4 8.9Z" /></svg>
          {{ t("status.appleLyrics") }}
        </button>
      </div>
    </div>
  </section>
  <CustomMatchDialog v-if="customMatchOpen" @close="customMatchOpen = false" />
</template>

<style scoped>
.status-card { display: grid; grid-template-columns: 3.5rem 1fr; gap: 1rem; align-items: start; width: min(42rem, 100%); padding: 1.5rem; border: 1px solid rgb(255 255 255 / 14%); border-radius: 1.25rem; background: rgb(10 12 18 / 42%); backdrop-filter: blur(22px); }
.status-mark { display: grid; place-items: center; width: 3.5rem; height: 3.5rem; border-radius: 1rem; color: white; background: rgb(255 255 255 / 12%); font-size: 1.4rem; font-weight: 750; }
.status-mark.busy { animation: breathe 1.2s ease-in-out infinite; }
h2 { margin: 0 0 .45rem; font-size: 1.25rem; color: rgb(255 255 255 / 94%); }
p { margin: 0; color: rgb(255 255 255 / 68%); line-height: 1.55; }
.actions { display: flex; flex-wrap: wrap; gap: .58rem; margin-top: 1.1rem; }
button { min-height: 2.55rem; border: 1px solid transparent; border-radius: .78rem; padding: 0 .92rem; font: inherit; font-size: .8rem; font-weight: 700; cursor: pointer; transition: color 220ms ease, border-color 220ms ease, background 220ms ease, transform 360ms cubic-bezier(.22, 1, .36, 1), filter 220ms ease; }
button:hover { transform: translateY(-1px); }
button:active { transform: scale(.96); }
button:focus-visible { outline: .13rem solid #fff; outline-offset: .13rem; }
button.primary { color: #11131a; background: white; }
button.secondary { color: rgb(255 255 255 / 82%); border-color: rgb(255 255 255 / 8%); background: rgb(255 255 255 / 8%); }
button.secondary:hover { color: #fff; border-color: rgb(255 255 255 / 15%); background: rgb(255 255 255 / 12%); }
button.apple-action { display: inline-flex; align-items: center; gap: .43rem; color: rgb(255 255 255 / 74%); border-color: rgb(255 255 255 / 10%); background: rgb(5 5 8 / 34%); }
button.apple-action:hover { color: #fff; background: rgb(255 255 255 / 7%); }
button.apple-action:disabled { opacity: .38; cursor: not-allowed; transform: none; }
button.apple-action svg { width: .9rem; height: .9rem; fill: currentColor; }
@keyframes breathe { 50% { opacity: .45; transform: scale(.94); } }
</style>
