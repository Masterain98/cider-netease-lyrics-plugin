<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from "vue";
import { readCiderLanguage, resolveLocale, translate, type MessageKey } from "../i18n/settings-i18n";
import { lyricController, lyricState } from "../stores/lyric-store";
import { settings } from "../stores/settings-store";

const emit = defineEmits<{ close: [] }>();
const locale = computed(() => resolveLocale(settings.locale, readCiderLanguage()));
const t = (key: MessageKey) => translate(locale.value, key);
const songInput = ref<HTMLInputElement>();
const title = ref(lyricState.track?.title ?? "");
const artist = ref(lyricState.track?.artist ?? "");
const album = ref(lyricState.track?.album ?? "");
const submitting = ref(false);
const error = ref("");

async function submit() {
  if (!title.value.trim() || !artist.value.trim()) {
    error.value = t("customMatch.required");
    return;
  }
  error.value = "";
  submitting.value = true;
  try {
    await lyricController.customSearch({ title: title.value, artist: artist.value, album: album.value });
    emit("close");
  } finally {
    submitting.value = false;
  }
}

function close() {
  if (!submitting.value) emit("close");
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}

onMounted(() => {
  window.addEventListener("keydown", onKeydown, true);
  void nextTick(() => songInput.value?.select());
});

onUnmounted(() => window.removeEventListener("keydown", onKeydown, true));
</script>

<template>
  <div class="match-backdrop" @pointerdown.self="close">
    <section class="match-dialog" role="dialog" aria-modal="true" :aria-labelledby="'custom-match-title'">
      <header>
        <div>
          <p class="kicker">{{ t("customMatch.kicker") }}</p>
          <h2 id="custom-match-title">{{ t("customMatch.title") }}</h2>
          <p class="description">{{ t("customMatch.description") }}</p>
        </div>
        <button type="button" class="close-button" :aria-label="t('customMatch.cancel')" @click="close">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m7 7 10 10M17 7 7 17" /></svg>
        </button>
      </header>

      <form @submit.prevent="submit">
        <label>
          <span>{{ t("customMatch.song") }}</span>
          <input ref="songInput" v-model="title" type="text" maxlength="256" autocomplete="off" :disabled="submitting" />
        </label>
        <label>
          <span>{{ t("customMatch.artist") }}</span>
          <input v-model="artist" type="text" maxlength="256" autocomplete="off" :disabled="submitting" />
        </label>
        <label>
          <span>{{ t("customMatch.album") }} <small>{{ t("customMatch.albumHint") }}</small></span>
          <input v-model="album" type="text" maxlength="256" autocomplete="off" :disabled="submitting" />
        </label>
        <p v-if="error" class="form-error" role="alert">{{ error }}</p>
        <footer>
          <button type="button" class="cancel-button" :disabled="submitting" @click="close">{{ t("customMatch.cancel") }}</button>
          <button type="submit" class="submit-button" :disabled="submitting">
            <span v-if="submitting" class="search-pulse" aria-hidden="true" />
            {{ submitting ? t("customMatch.searching") : t("customMatch.submit") }}
          </button>
        </footer>
      </form>
    </section>
  </div>
</template>

<style scoped>
.match-backdrop { position: fixed; z-index: 20; inset: 0; display: grid; place-items: center; padding: 1.5rem; background: rgb(4 4 7 / 66%); backdrop-filter: blur(18px) saturate(90%); animation: backdrop-in 240ms ease both; }
.match-dialog { width: min(35rem, 100%); overflow: hidden; border: 1px solid rgb(255 255 255 / 13%); border-radius: 1.5rem; color: #fff; background: radial-gradient(circle at 82% -15%, rgb(231 43 66 / 18%), transparent 38%), rgb(13 12 17 / 94%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 9%), 0 2.5rem 8rem rgb(0 0 0 / 58%); animation: dialog-in 520ms cubic-bezier(.22, 1, .36, 1) both; }
header { display: flex; align-items: start; justify-content: space-between; gap: 1.5rem; padding: 1.65rem 1.7rem 1.3rem; }
.kicker { margin: 0 0 .42rem; color: #ff5368; font-size: .7rem; font-weight: 760; letter-spacing: .13em; text-transform: uppercase; }
h2 { margin: 0; font-size: clamp(1.35rem, 2.2vw, 1.75rem); font-weight: 720; line-height: 1.16; letter-spacing: -.035em; text-wrap: balance; }
.description { max-width: 31rem; margin: .62rem 0 0; color: rgb(255 255 255 / 53%); font-size: .82rem; line-height: 1.55; text-wrap: pretty; }
.close-button { flex: 0 0 auto; display: grid; place-items: center; width: 2.45rem; height: 2.45rem; border: 1px solid rgb(255 255 255 / 11%); border-radius: .85rem; color: rgb(255 255 255 / 62%); background: rgb(255 255 255 / 5%); cursor: pointer; transition: color 220ms ease, background 220ms ease, transform 360ms cubic-bezier(.22, 1, .36, 1); }
.close-button:hover { color: #fff; background: rgb(255 255 255 / 10%); transform: rotate(4deg); }
.close-button:active { transform: scale(.94); }
.close-button svg { width: 1.15rem; height: 1.15rem; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; }
form { display: grid; gap: .95rem; padding: 0 1.7rem 1.65rem; }
label { display: grid; gap: .42rem; }
label > span { display: flex; align-items: baseline; justify-content: space-between; gap: 1rem; color: rgb(255 255 255 / 70%); font-size: .78rem; font-weight: 650; }
label small { color: rgb(255 255 255 / 34%); font-size: .68rem; font-weight: 520; }
input { width: 100%; height: 3rem; box-sizing: border-box; border: 1px solid rgb(255 255 255 / 11%); border-radius: .82rem; padding: 0 .95rem; color: rgb(255 255 255 / 94%); background: rgb(255 255 255 / 6%); box-shadow: inset 0 1px 0 rgb(255 255 255 / 4%); font: inherit; font-size: .88rem; outline: none; transition: border-color 220ms ease, background 220ms ease, box-shadow 220ms ease, transform 300ms cubic-bezier(.22, 1, .36, 1); }
input:hover { background: rgb(255 255 255 / 8%); }
input:focus { border-color: rgb(255 64 88 / 72%); background: rgb(255 255 255 / 9%); box-shadow: 0 0 0 .2rem rgb(231 43 66 / 14%); transform: translateY(-1px); }
input:disabled { opacity: .55; }
.form-error { margin: -.1rem 0 0; color: #ff9ca9; font-size: .76rem; }
footer { display: flex; justify-content: flex-end; gap: .65rem; margin-top: .35rem; }
footer button { min-height: 2.7rem; border-radius: .8rem; padding: 0 1rem; font: inherit; font-size: .8rem; font-weight: 720; cursor: pointer; transition: transform 320ms cubic-bezier(.22, 1, .36, 1), filter 220ms ease, background 220ms ease; }
footer button:hover { transform: translateY(-1px); }
footer button:active { transform: scale(.96); }
footer button:focus-visible, .close-button:focus-visible { outline: .13rem solid #fff; outline-offset: .14rem; }
footer button:disabled { opacity: .55; cursor: wait; transform: none; }
.cancel-button { border: 1px solid rgb(255 255 255 / 10%); color: rgb(255 255 255 / 67%); background: rgb(255 255 255 / 5%); }
.submit-button { display: inline-flex; align-items: center; gap: .5rem; border: 1px solid rgb(255 81 103 / 38%); color: #fff; background: #d92740; box-shadow: inset 0 1px 0 rgb(255 255 255 / 20%), 0 .65rem 1.6rem rgb(116 4 24 / 28%); }
.submit-button:hover { filter: brightness(1.08); }
.search-pulse { width: .48rem; height: .48rem; border-radius: 50%; background: currentColor; animation: pulse 850ms ease-in-out infinite alternate; }
@keyframes backdrop-in { from { opacity: 0; } }
@keyframes dialog-in { from { opacity: 0; transform: translateY(1rem) scale(.975); } }
@keyframes pulse { to { opacity: .25; transform: scale(.7); } }
@media (max-width: 560px) { .match-backdrop { align-items: end; padding: .75rem; } .match-dialog { border-radius: 1.3rem; } header { padding: 1.35rem 1.25rem 1rem; } form { padding: 0 1.25rem 1.25rem; } footer { display: grid; grid-template-columns: 1fr 1.35fr; } }
@media (prefers-reduced-motion: reduce) { .match-backdrop, .match-dialog, .search-pulse { animation-duration: .01ms; } }
</style>
