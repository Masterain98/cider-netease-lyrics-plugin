<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { DirectNeteaseClient } from "../api/direct-netease-client";
import { LyricsGatewayClient } from "../api/lyrics-gateway-client";
import {
  normalizeLocale,
  readCiderLanguage,
  resolveLocale,
  translate,
  type MessageKey,
  type ResolvedLocale,
} from "../i18n/settings-i18n";
import pluginConfig from "../plugin.config";
import { PluginError, type PluginErrorCode } from "../domain/errors";
import { lyricState } from "../stores/lyric-store";
import { MappingStore, type MappingRecord } from "../stores/mapping-store";
import { settings } from "../stores/settings-store";
import { traditionalLyricsConverter } from "../utils/traditional-lyrics";

type ConnectionResult =
  | { state: "idle" }
  | { state: "testing" }
  | { state: "success"; kind: "direct"; candidateCount: number; endpoint: string }
  | { state: "success"; kind: "gateway"; schemaVersion: string | number }
  | { state: "warning" }
  | { state: "error"; message: string };

const storage = new MappingStore();
const mappings = ref<MappingRecord[]>([]);
const connectionResult = ref<ConnectionResult>({ state: "idle" });
const storageNotice = ref("");
const languagePicker = ref<HTMLElement | null>(null);
const languageMenuOpen = ref(false);
const gatewayClient = new LyricsGatewayClient(() => settings.gatewayUrl, () => settings.requestTimeoutMs);
const directClient = new DirectNeteaseClient(() => settings.requestTimeoutMs);

const hostLanguage = computed(readCiderLanguage);
const locale = computed(() => resolveLocale(settings.locale, hostLanguage.value));
const htmlLanguage = computed(() => locale.value === "zh-CN" ? "zh-Hans" : locale.value === "zh-TW" ? "zh-Hant" : "en");
const t = (key: MessageKey, variables?: Record<string, string | number>) => translate(locale.value, key, variables);

function localeName(value: ResolvedLocale): string {
  const keys: Record<ResolvedLocale, MessageKey> = {
    "zh-CN": "language.zhCN",
    "zh-TW": "language.zhTW",
    "en-US": "language.enUS",
  };
  return translate(locale.value, keys[value]);
}

const autoLocaleLabel = computed(() => t("language.auto", { language: localeName(normalizeLocale(hostLanguage.value)) }));
const languageOptions = computed(() => [
  { value: "auto" as const, label: autoLocaleLabel.value },
  { value: "zh-CN" as const, label: t("language.zhCN") },
  { value: "zh-TW" as const, label: t("language.zhTW") },
  { value: "en-US" as const, label: t("language.enUS") },
]);
const selectedLanguageLabel = computed(() => languageOptions.value.find((option) => option.value === settings.locale)?.label ?? autoLocaleLabel.value);
const requestTimeoutSeconds = computed({
  get: () => settings.requestTimeoutMs / 1_000,
  set: (value: number) => { settings.requestTimeoutMs = Math.round(Math.min(30, Math.max(1, value)) * 1_000); },
});

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function adjustTimeout(delta: number) {
  requestTimeoutSeconds.value = clamp(requestTimeoutSeconds.value + delta, 1, 30);
}

function adjustCacheTtl(delta: number) {
  settings.cacheTtlDays = clamp(settings.cacheTtlDays + delta, 7, 30);
}

async function openLanguageMenu(focusSelected = false) {
  languageMenuOpen.value = true;
  if (!focusSelected) return;
  await nextTick();
  languagePicker.value?.querySelector<HTMLElement>("[role='option'][aria-selected='true']")?.focus();
}

function chooseLanguage(value: typeof settings.locale) {
  settings.locale = value;
  languageMenuOpen.value = false;
  nextTick(() => languagePicker.value?.querySelector<HTMLElement>(".language-trigger")?.focus());
}

function handleLanguageTriggerKeydown(event: KeyboardEvent) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    void openLanguageMenu(true);
  }
}

function handleLanguageMenuKeydown(event: KeyboardEvent) {
  const options = [...(languagePicker.value?.querySelectorAll<HTMLElement>("[role='option']") ?? [])];
  const current = options.indexOf(document.activeElement as HTMLElement);
  let target = current;
  if (event.key === "ArrowDown") target = Math.min(options.length - 1, current + 1);
  else if (event.key === "ArrowUp") target = Math.max(0, current - 1);
  else if (event.key === "Home") target = 0;
  else if (event.key === "End") target = options.length - 1;
  else if (event.key === "Escape") {
    event.preventDefault();
    languageMenuOpen.value = false;
    languagePicker.value?.querySelector<HTMLElement>(".language-trigger")?.focus();
    return;
  } else return;
  event.preventDefault();
  options[target]?.focus();
}

function closeLanguageMenu(event: PointerEvent) {
  if (!languagePicker.value?.contains(event.target as Node)) languageMenuOpen.value = false;
}

const connectionStatus = computed(() => {
  const result = connectionResult.value;
  if (result.state === "idle") return t("connection.idle");
  if (result.state === "testing") return t("connection.testing");
  if (result.state === "warning") return t("connection.gatewayUnexpected");
  if (result.state === "error") return t("connection.failed", { message: result.message });
  if (result.kind === "direct") return t("connection.directOk", { count: result.candidateCount });
  return t("connection.gatewayOk", { version: result.schemaVersion });
});

const diagnosticRows = computed(() => [
  [t("diagnostics.connectionMode"), lyricState.diagnostics.connectionMode],
  [t("diagnostics.upstreamType"), lyricState.diagnostics.upstreamType],
  [t("diagnostics.requestTarget"), lyricState.diagnostics.requestTarget],
  [t("diagnostics.connectionProbe"), lyricState.diagnostics.connectionProbe ?? "—"],
  [t("diagnostics.appleMusicId"), lyricState.track?.appleMusicId ?? "—"],
  [t("diagnostics.title"), lyricState.track?.title ?? "—"],
  [t("diagnostics.artist"), lyricState.track?.artist ?? "—"],
  [t("diagnostics.album"), lyricState.track?.album ?? "—"],
  [t("diagnostics.durationMs"), lyricState.track?.durationMs ?? "—"],
  [t("diagnostics.searchQueries"), lyricState.diagnostics.searchQueries],
  [t("diagnostics.candidateScores"), lyricState.diagnostics.candidates.map((candidate) => ({
    neteaseId: candidate.neteaseId,
    title: candidate.title,
    score: candidate.score,
    breakdown: candidate.scoreBreakdown,
    severeVersionConflict: candidate.severeVersionConflict,
  }))],
  [t("diagnostics.selectedNeteaseId"), lyricState.diagnostics.selectedNeteaseId ?? "—"],
  [t("diagnostics.lyricFields"), lyricState.diagnostics.lyricFields ?? "—"],
  [t("diagnostics.requestDurationMs"), lyricState.diagnostics.requestDurationMs ?? "—"],
  [t("diagnostics.cache"), lyricState.diagnostics.cache],
  [t("diagnostics.lastErrorCode"), lyricState.diagnostics.lastErrorCode ?? "—"],
  [t("diagnostics.trackSourceProbe"), lyricState.diagnostics.trackSourceProbe ?? "—"],
] as const);

function displayValue(value: unknown): string {
  return typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
}

async function refreshMappings() {
  mappings.value = await storage.listMappings();
}

async function testConnection() {
  connectionResult.value = { state: "testing" };
  try {
    if (settings.connectionMode === "direct") {
      const response = await directClient.probe();
      connectionResult.value = { state: "success", kind: "direct", candidateCount: response.candidateCount, endpoint: response.endpoint };
      lyricState.diagnostics.connectionProbe = `Direct capability probe succeeded: ${response.endpoint}`;
    } else {
      const response = await gatewayClient.health();
      connectionResult.value = response.status === "ok"
        ? { state: "success", kind: "gateway", schemaVersion: response.schemaVersion }
        : { state: "warning" };
      lyricState.diagnostics.connectionProbe = connectionStatus.value;
    }
  } catch (error) {
    const errorMessages: Partial<Record<PluginErrorCode, MessageKey>> = {
      DIRECT_CONNECTION_FAILED: "connection.error.direct",
      TIMEOUT: "connection.error.timeout",
      DIRECT_ACCESS_BLOCKED: "connection.error.blocked",
      DIRECT_API_CHANGED: "connection.error.apiChanged",
      RATE_LIMITED: "connection.error.rateLimited",
      UPSTREAM_UNAVAILABLE: "connection.error.upstream",
    };
    const messageKey = error instanceof PluginError ? errorMessages[error.code] : undefined;
    const localizedMessage = t(messageKey ?? "connection.error.generic");
    connectionResult.value = { state: "error", message: localizedMessage };
    lyricState.diagnostics.connectionProbe = localizedMessage;
    lyricState.diagnostics.lastErrorCode = error instanceof PluginError ? error.code : "UNKNOWN_ERROR";
  }
}

function showStorageNotice(message: string) {
  storageNotice.value = message;
  window.setTimeout(() => { storageNotice.value = ""; }, 2_400);
}

async function clearLyrics() {
  await storage.clearLyrics();
  showStorageNotice(t("storage.lyricsCleared"));
}

async function clearMappings() {
  await storage.clearMappings();
  await refreshMappings();
  showStorageNotice(t("storage.mappingsCleared"));
}

async function deleteMapping(trackKey: string) {
  await storage.deleteMapping(trackKey);
  await refreshMappings();
}

function loadTraditionalLyricsConverter() {
  void traditionalLyricsConverter.load().catch(() => undefined);
}

function retryTraditionalLyricsConverter() {
  void traditionalLyricsConverter.retry().catch(() => undefined);
}

watch(() => settings.connectionMode, () => { connectionResult.value = { state: "idle" }; });
watch(
  () => settings.convertLyricsToTraditional,
  (enabled) => {
    if (enabled) loadTraditionalLyricsConverter();
  },
  { immediate: true },
);
onMounted(() => {
  void refreshMappings();
  document.addEventListener("pointerdown", closeLanguageMenu);
});
onBeforeUnmount(() => document.removeEventListener("pointerdown", closeLanguageMenu));
</script>

<template>
  <main class="settings plugin-base" :lang="htmlLanguage">
    <header class="hero">
      <div class="hero-copy">
        <p class="eyebrow"><span aria-hidden="true"></span>{{ t("brand.eyebrow") }}</p>
        <h1>{{ t("hero.title") }}</h1>
        <p class="hero-description">{{ t("hero.description") }}</p>
      </div>
      <div class="hero-tools">
        <span class="version">v{{ pluginConfig.version }}</span>
        <div ref="languagePicker" class="language-picker">
          <span id="cnl-language-label">{{ t("language.label") }}</span>
          <button
            class="language-trigger"
            type="button"
            role="combobox"
            aria-labelledby="cnl-language-label"
            aria-controls="cnl-language-options"
            :aria-expanded="languageMenuOpen"
            aria-haspopup="listbox"
            @click="languageMenuOpen ? languageMenuOpen = false : openLanguageMenu()"
            @keydown="handleLanguageTriggerKeydown"
          >
            <span>{{ selectedLanguageLabel }}</span><i aria-hidden="true">⌄</i>
          </button>
          <Transition name="menu">
            <div v-if="languageMenuOpen" id="cnl-language-options" class="language-menu" role="listbox" :aria-label="t('language.label')" @keydown="handleLanguageMenuKeydown">
              <button
                v-for="option in languageOptions"
                :key="option.value"
                type="button"
                role="option"
                :aria-selected="settings.locale === option.value"
                @click="chooseLanguage(option.value)"
              >
                <span>{{ option.label }}</span><i aria-hidden="true">✓</i>
              </button>
            </div>
          </Transition>
        </div>
      </div>
    </header>

    <section class="panel feature-panel">
      <div class="section-heading">
        <div>
          <p class="section-kicker">01 · {{ t("section.connection.kicker") }}</p>
          <h2>{{ t("section.connection.title") }}</h2>
          <p>{{ t("section.connection.description") }}</p>
        </div>
        <span class="status" :data-state="connectionResult.state"><i aria-hidden="true"></i>{{ connectionStatus }}</span>
      </div>

      <div class="mode-grid" role="radiogroup" :aria-label="t('connection.mode.aria')">
        <label class="mode-card" :class="{ selected: settings.connectionMode === 'direct' }">
          <input v-model="settings.connectionMode" type="radio" value="direct" />
          <span class="radio-mark" aria-hidden="true"></span>
          <span class="mode-copy">
            <strong>{{ t("connection.direct.title") }} <em>{{ t("connection.direct.badge") }}</em></strong>
            <small>{{ t("connection.direct.description") }}</small>
          </span>
          <span class="mode-arrow" aria-hidden="true">↗</span>
        </label>
        <label class="mode-card" :class="{ selected: settings.connectionMode === 'gateway' }">
          <input v-model="settings.connectionMode" type="radio" value="gateway" />
          <span class="radio-mark" aria-hidden="true"></span>
          <span class="mode-copy">
            <strong>{{ t("connection.gateway.title") }}</strong>
            <small>{{ t("connection.gateway.description") }}</small>
          </span>
          <span class="mode-arrow" aria-hidden="true">↗</span>
        </label>
      </div>

      <div class="connection-footer">
        <label v-if="settings.connectionMode === 'gateway'" class="field gateway-field">
          <span>{{ t("connection.gatewayUrl") }}</span>
          <input v-model.trim="settings.gatewayUrl" type="url" required spellcheck="false" />
        </label>
        <div class="field timeout-field">
          <span id="cnl-timeout-label">{{ t("connection.timeout") }}</span>
          <span class="number-stepper"><button type="button" :aria-label="t('control.decrease')" @click="adjustTimeout(-0.5)">−</button><input v-model.number="requestTimeoutSeconds" aria-labelledby="cnl-timeout-label" type="number" min="1" max="30" step="0.5" /><b>{{ t("connection.seconds") }}</b><button type="button" :aria-label="t('control.increase')" @click="adjustTimeout(0.5)">＋</button></span>
        </div>
        <button class="primary" type="button" :disabled="connectionResult.state === 'testing'" @click="testConnection">
          <span aria-hidden="true">⌁</span>{{ connectionResult.state === "testing" ? t("connection.testing") : t("connection.test") }}
        </button>
      </div>
    </section>

    <div class="settings-grid">
      <section class="panel preference-panel">
        <div class="section-heading compact">
          <div><p class="section-kicker">02 · {{ t("section.playback.kicker") }}</p><h2>{{ t("section.playback.title") }}</h2><p>{{ t("section.playback.description") }}</p></div>
        </div>
        <div class="toggle-list">
          <label class="toggle-row">
            <span><strong>{{ t("playback.autoMatch.title") }}</strong><small>{{ t("playback.autoMatch.description") }}</small></span>
            <input v-model="settings.autoMatch" type="checkbox" /><i aria-hidden="true"></i>
          </label>
          <label class="toggle-row">
            <span><strong>{{ t("playback.autoScroll.title") }}</strong><small>{{ t("playback.autoScroll.description") }}</small></span>
            <input v-model="settings.autoScroll" type="checkbox" /><i aria-hidden="true"></i>
          </label>
          <label class="toggle-row">
            <span><strong>{{ t("playback.seek.title") }}</strong><small>{{ t("playback.seek.description") }}</small></span>
            <input v-model="settings.allowSeek" type="checkbox" /><i aria-hidden="true"></i>
          </label>
        </div>
      </section>

      <section class="panel preference-panel">
        <div class="section-heading compact">
          <div><p class="section-kicker">03 · {{ t("section.lyrics.kicker") }}</p><h2>{{ t("section.lyrics.title") }}</h2><p>{{ t("section.lyrics.description") }}</p></div>
        </div>
        <div class="toggle-list short">
          <label class="toggle-row"><span><strong>{{ t("lyrics.original.title") }}</strong></span><input v-model="settings.showOriginal" type="checkbox" /><i aria-hidden="true"></i></label>
          <label class="toggle-row"><span><strong>{{ t("lyrics.translation.title") }}</strong></span><input v-model="settings.showTranslation" type="checkbox" /><i aria-hidden="true"></i></label>
          <label class="toggle-row"><span><strong>{{ t("lyrics.chineseOnly.title") }}</strong><small>{{ t("lyrics.chineseOnly.description") }}</small></span><input v-model="settings.chineseTranslationOnly" type="checkbox" /><i aria-hidden="true"></i></label>
          <label class="toggle-row"><span><strong>{{ t("lyrics.traditional.title") }}</strong><small>{{ t("lyrics.traditional.description") }}</small></span><input v-model="settings.convertLyricsToTraditional" type="checkbox" /><i aria-hidden="true"></i></label>
        </div>
        <div
          v-if="settings.convertLyricsToTraditional && ['loading', 'error'].includes(traditionalLyricsConverter.state.status)"
          class="conversion-notice"
          :data-state="traditionalLyricsConverter.state.status"
          :role="traditionalLyricsConverter.state.status === 'error' ? 'alert' : 'status'"
        >
          <span>{{ t(traditionalLyricsConverter.state.status === "error" ? "lyrics.traditional.error" : "lyrics.traditional.loading") }}</span>
          <button v-if="traditionalLyricsConverter.state.status === 'error'" type="button" class="link" @click="retryTraditionalLyricsConverter">{{ t("lyrics.traditional.retry") }}</button>
        </div>
        <div class="range-grid">
          <label class="range-field"><span><b>{{ t("lyrics.lyricSize") }}</b><output>{{ Math.round(settings.originalFontSize * 100) }}%</output></span><input v-model.number="settings.originalFontSize" :aria-label="t('lyrics.lyricSize')" :style="{ '--range-progress': `${((settings.originalFontSize - 0.8) / 0.4) * 100}%` }" type="range" min="0.8" max="1.2" step="0.05" /></label>
          <label class="range-field"><span><b>{{ t("lyrics.fontSize") }}</b><output>{{ Math.round(settings.translationFontSize * 100) }}%</output></span><input v-model.number="settings.translationFontSize" :aria-label="t('lyrics.fontSize')" :style="{ '--range-progress': `${((settings.translationFontSize - 0.45) / 0.45) * 100}%` }" type="range" min="0.45" max="0.9" step="0.05" /></label>
          <label class="range-field"><span><b>{{ t("lyrics.opacity") }}</b><output>{{ Math.round(settings.translationOpacity * 100) }}%</output></span><input v-model.number="settings.translationOpacity" :aria-label="t('lyrics.opacity')" :style="{ '--range-progress': `${((settings.translationOpacity - 0.35) / 0.65) * 100}%` }" type="range" min="0.35" max="1" step="0.05" /></label>
        </div>
      </section>
    </div>

    <section class="panel storage-panel">
      <div class="section-heading">
        <div><p class="section-kicker">04 · {{ t("section.storage.kicker") }}</p><h2>{{ t("section.storage.title") }}</h2><p>{{ t("section.storage.description") }}</p></div>
        <span v-if="storageNotice" class="action-notice" role="status">✓ {{ storageNotice }}</span>
      </div>
      <div class="storage-toolbar">
        <label class="cache-toggle">
          <span><strong>{{ t("storage.cache.title") }}</strong><small>{{ t("storage.cache.description") }}</small></span>
          <input v-model="settings.cacheEnabled" type="checkbox" /><i aria-hidden="true"></i>
        </label>
        <div class="field ttl-field"><span id="cnl-ttl-label">{{ t("storage.ttl") }}</span><span class="number-stepper"><button type="button" :aria-label="t('control.decrease')" @click="adjustCacheTtl(-1)">−</button><input v-model.number="settings.cacheTtlDays" aria-labelledby="cnl-ttl-label" type="number" min="7" max="30" /><b>{{ t("storage.days", { count: "" }).trim() }}</b><button type="button" :aria-label="t('control.increase')" @click="adjustCacheTtl(1)">＋</button></span></div>
        <div class="storage-actions">
          <button type="button" class="secondary" @click="clearLyrics">{{ t("storage.clearLyrics") }}</button>
          <button type="button" class="danger" @click="clearMappings">{{ t("storage.clearMappings") }}</button>
        </div>
      </div>

      <div class="mapping-heading"><strong>{{ t("storage.mappingCount", { count: mappings.length }) }}</strong></div>
      <div v-if="mappings.length" class="mapping-list">
        <div v-for="mapping in mappings" :key="mapping.trackKey" class="mapping">
          <div><strong>{{ mapping.track.title }}</strong><span>{{ mapping.track.artist }} · {{ t("storage.neteaseId", { id: mapping.neteaseId }) }}</span></div>
          <button type="button" class="link" @click="deleteMapping(mapping.trackKey)">{{ t("storage.remove") }}</button>
        </div>
      </div>
      <p v-else class="empty">{{ t("storage.empty") }}</p>
    </section>

    <details class="panel diagnostics-panel">
      <summary>
        <span class="summary-copy"><span class="section-kicker">05 · {{ t("section.diagnostics.kicker") }}</span><strong>{{ t("section.diagnostics.title") }}</strong><small>{{ t("section.diagnostics.description") }}</small></span>
        <span class="summary-arrow" aria-hidden="true">⌄</span>
      </summary>
      <div class="diagnostics-content">
        <dl class="diagnostics">
          <template v-for="([label, value], index) in diagnosticRows" :key="index"><dt>{{ label }}</dt><dd><pre>{{ displayValue(value) }}</pre></dd></template>
        </dl>
        <div class="probe">
          <strong>{{ t("diagnostics.providerProbe") }}</strong><span>{{ lyricState.diagnostics.providerProbe }}</span>
          <strong>{{ t("diagnostics.simpleLyricViewProbe") }}</strong><span>{{ lyricState.diagnostics.simpleLyricViewProbe }}</span>
        </div>
      </div>
    </details>

    <footer class="privacy-note">
      <span class="privacy-icon" aria-hidden="true">◎</span>
      <div><strong>{{ t("privacy.title") }}</strong><p>{{ t("privacy.description") }}</p></div>
      <a href="https://music.163.com/" target="_blank" rel="noopener noreferrer">{{ t("privacy.source") }} ↗</a>
    </footer>
  </main>
</template>

<style scoped>
.settings {
  --cnl-red: #e72b42;
  --cnl-red-strong: #ff4058;
  --cnl-line: color-mix(in srgb, currentColor 13%, transparent);
  --cnl-line-soft: color-mix(in srgb, currentColor 8%, transparent);
  --cnl-muted: color-mix(in srgb, currentColor 62%, transparent);
  --cnl-faint: color-mix(in srgb, currentColor 5%, transparent);
  --cnl-surface: color-mix(in srgb, currentColor 4.5%, transparent);
  --cnl-surface-raised: color-mix(in srgb, currentColor 7%, transparent);
  --cnl-ease: cubic-bezier(.22, 1, .36, 1);
  width: min(76rem, 100%);
  box-sizing: border-box;
  margin: 0 auto;
  padding: clamp(1.5rem, 4vw, 3.75rem) clamp(1rem, 4vw, 3.25rem) 5rem;
  color: var(--text-color, inherit);
  font-family: Figtree, Pretendard, "Segoe UI", sans-serif;
}

button, input { font: inherit; }
button, label, summary { -webkit-tap-highlight-color: transparent; }
button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--cnl-red-strong); outline-offset: 3px; }

.hero { display: flex; align-items: flex-start; justify-content: space-between; gap: 3rem; margin-bottom: clamp(2rem, 5vw, 3.6rem); }
.hero-copy { max-width: 46rem; }
.eyebrow, .section-kicker { margin: 0; color: var(--cnl-red-strong); font-size: .68rem; font-weight: 850; letter-spacing: .17em; text-transform: uppercase; }
.eyebrow { display: flex; align-items: center; gap: .55rem; }
.eyebrow span { width: .48rem; height: .48rem; border-radius: 50%; background: var(--cnl-red); box-shadow: 0 0 0 .3rem color-mix(in srgb, var(--cnl-red) 14%, transparent); }
.hero h1 { max-width: 16ch; margin: .72rem 0 .72rem; font-size: clamp(2.15rem, 4.25vw, 3.85rem); font-weight: 760; line-height: 1; letter-spacing: -.055em; }
.hero-description { max-width: 42rem; margin: 0; color: var(--cnl-muted); font-size: clamp(.96rem, 1.35vw, 1.08rem); line-height: 1.7; }
.hero-tools { display: flex; min-width: 13.5rem; flex-direction: column; align-items: flex-end; gap: 1rem; }
.version { padding: .38rem .62rem; border: 1px solid var(--cnl-line); border-radius: 999px; color: var(--cnl-muted); font-size: .7rem; font-weight: 720; letter-spacing: .06em; }
.language-picker { position: relative; display: grid; width: 100%; gap: .42rem; color: var(--cnl-muted); font-size: .72rem; font-weight: 680; }
.language-trigger { display: flex; width: 100%; min-height: 2.65rem; align-items: center; justify-content: space-between; gap: 1rem; border: 1px solid var(--cnl-line); padding: .68rem .72rem .68rem .82rem; color: inherit; background: var(--cnl-surface-raised); text-align: left; }
.language-trigger:hover { border-color: color-mix(in srgb, currentColor 25%, transparent); background: color-mix(in srgb, currentColor 10%, transparent); }
.language-trigger i { display: grid; width: 1.25rem; height: 1.25rem; flex: 0 0 auto; place-items: center; border-radius: 50%; background: var(--cnl-faint); font-size: .75rem; font-style: normal; transition: transform .25s var(--cnl-ease); }
.language-trigger[aria-expanded="true"] { border-color: color-mix(in srgb, var(--cnl-red) 60%, transparent); }
.language-trigger[aria-expanded="true"] i { color: var(--cnl-red-strong); transform: rotate(180deg); }
.language-menu { position: absolute; z-index: 30; top: calc(100% + .48rem); right: 0; display: grid; width: 100%; box-sizing: border-box; gap: .22rem; padding: .38rem; border: 1px solid color-mix(in srgb, #fff 12%, transparent); border-radius: .9rem; color: #f7f4f5; background: rgb(24 22 27 / 97%); box-shadow: 0 1.35rem 3.5rem rgb(0 0 0 / 42%); backdrop-filter: blur(1.5rem) saturate(1.25); }
.language-menu button { display: flex; min-height: 2.4rem; align-items: center; justify-content: space-between; gap: .8rem; padding: .58rem .66rem; color: #d9d4d7; background: transparent; text-align: left; }
.language-menu button:hover, .language-menu button:focus-visible { color: #fff; background: rgb(255 255 255 / 8%); transform: none; }
.language-menu button[aria-selected="true"] { color: #fff; background: color-mix(in srgb, var(--cnl-red) 14%, transparent); }
.language-menu button i { color: var(--cnl-red-strong); font-style: normal; opacity: 0; }
.language-menu button[aria-selected="true"] i { opacity: 1; }
.menu-enter-active, .menu-leave-active { transition: opacity .18s ease, transform .22s var(--cnl-ease); transform-origin: top right; }
.menu-enter-from, .menu-leave-to { opacity: 0; transform: translateY(-.35rem) scale(.98); }

.panel { border: 1px solid var(--cnl-line); border-radius: 1.3rem; background: var(--cnl-surface); box-shadow: 0 1.2rem 3.5rem color-mix(in srgb, #000 7%, transparent); }
.feature-panel, .storage-panel { padding: clamp(1.25rem, 3vw, 2rem); }
.section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 1.5rem; margin-bottom: 1.45rem; }
.section-heading > div { max-width: 46rem; }
.section-heading h2 { margin: .44rem 0 .38rem; font-size: clamp(1.25rem, 2.2vw, 1.65rem); font-weight: 735; letter-spacing: -.028em; }
.section-heading p:not(.section-kicker) { margin: 0; color: var(--cnl-muted); font-size: .88rem; line-height: 1.55; }
.section-heading.compact { margin-bottom: .95rem; }

.status { display: inline-flex; flex: 0 0 auto; align-items: center; gap: .48rem; max-width: 25rem; padding: .45rem .68rem; border: 1px solid var(--cnl-line-soft); border-radius: 999px; color: var(--cnl-muted); background: var(--cnl-faint); font-size: .74rem; line-height: 1.25; }
.status i { width: .42rem; height: .42rem; flex: 0 0 auto; border-radius: 50%; background: currentColor; }
.status[data-state="testing"] i { animation: pulse 1.1s ease-in-out infinite; }
.status[data-state="success"] { color: #39a968; background: color-mix(in srgb, #39a968 9%, transparent); }
.status[data-state="warning"], .status[data-state="error"] { color: var(--cnl-red-strong); background: color-mix(in srgb, var(--cnl-red) 9%, transparent); }

.mode-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .8rem; }
.mode-card { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: flex-start; gap: .8rem; min-height: 5.4rem; box-sizing: border-box; padding: 1.08rem; border: 1px solid var(--cnl-line-soft); border-radius: 1rem; background: color-mix(in srgb, currentColor 2.5%, transparent); cursor: pointer; transition: transform .28s var(--cnl-ease), border-color .28s ease, background .28s ease; }
.mode-card:hover { transform: translateY(-2px); border-color: color-mix(in srgb, currentColor 24%, transparent); background: var(--cnl-surface-raised); }
.mode-card.selected { border-color: color-mix(in srgb, var(--cnl-red) 64%, transparent); background: color-mix(in srgb, var(--cnl-red) 7%, transparent); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--cnl-red) 12%, transparent); }
.mode-card > input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
.radio-mark { display: grid; width: 1.12rem; height: 1.12rem; margin-top: .08rem; place-items: center; border: 1px solid var(--cnl-line); border-radius: 50%; }
.selected .radio-mark { border-color: var(--cnl-red); }
.selected .radio-mark::after { width: .54rem; height: .54rem; border-radius: 50%; background: var(--cnl-red); content: ""; }
.mode-copy { display: grid; gap: .38rem; }
.mode-copy strong { font-size: .92rem; }
.mode-copy small { color: var(--cnl-muted); font-size: .79rem; line-height: 1.48; }
.mode-copy em { margin-left: .35rem; padding: .18rem .38rem; border-radius: 999px; color: var(--cnl-red-strong); background: color-mix(in srgb, var(--cnl-red) 10%, transparent); font-size: .6rem; font-style: normal; letter-spacing: .03em; }
.mode-arrow { color: var(--cnl-muted); opacity: 0; transform: translate(-.2rem, .2rem); transition: opacity .25s ease, transform .25s var(--cnl-ease); }
.mode-card:hover .mode-arrow, .mode-card.selected .mode-arrow { opacity: 1; transform: none; }

.connection-footer { display: flex; align-items: flex-end; gap: .8rem; margin-top: 1rem; }
.field { display: grid; gap: .42rem; color: var(--cnl-muted); font-size: .74rem; font-weight: 680; }
.gateway-field { flex: 1 1 22rem; }
.timeout-field { flex: 0 0 10rem; }
.number-stepper { display: grid; grid-template-columns: 2.15rem minmax(2.3rem, 1fr) auto 2.15rem; min-height: 2.65rem; align-items: center; overflow: hidden; border: 1px solid var(--cnl-line); border-radius: .78rem; background: var(--cnl-faint); transition: border-color .2s ease, background .2s ease; }
.number-stepper:focus-within { border-color: var(--cnl-red); background: color-mix(in srgb, var(--cnl-red) 5%, transparent); }
.number-stepper button { align-self: stretch; border-radius: 0; padding: 0; color: var(--cnl-muted); background: transparent; font-size: 1rem; font-weight: 520; }
.number-stepper button:first-child { border-right: 1px solid var(--cnl-line-soft); }
.number-stepper button:last-child { border-left: 1px solid var(--cnl-line-soft); }
.number-stepper button:hover { color: #fff; background: var(--cnl-red); transform: none; }
.number-stepper input { min-width: 0; border: 0; padding: .68rem .28rem; color: inherit; background: transparent; text-align: center; font-variant-numeric: tabular-nums; }
.number-stepper input:focus { outline: none; }
.number-stepper b { padding-inline: .58rem .42rem; color: var(--cnl-muted); font-size: .7rem; font-weight: 620; white-space: nowrap; }
input[type="url"], input[type="number"] { width: 100%; box-sizing: border-box; border: 1px solid var(--cnl-line); border-radius: .78rem; padding: .72rem .78rem; color: inherit; background: var(--cnl-faint); transition: border-color .2s ease, background .2s ease; }
.number-stepper input[type="number"] { border: 0; border-radius: 0; }
input[type="number"] { appearance: textfield; -moz-appearance: textfield; }
input[type="number"]::-webkit-inner-spin-button, input[type="number"]::-webkit-outer-spin-button { margin: 0; appearance: none; }
input[type="url"]:focus, input[type="number"]:focus { border-color: var(--cnl-red); background: color-mix(in srgb, var(--cnl-red) 5%, transparent); outline: none; }
button { border: 0; border-radius: .78rem; padding: .75rem 1rem; font-weight: 760; cursor: pointer; transition: transform .22s var(--cnl-ease), background .2s ease, opacity .2s ease; }
button:hover:not(:disabled) { transform: translateY(-1px); }
button:active:not(:disabled) { transform: scale(.98); }
button:disabled { cursor: wait; opacity: .58; }
button.primary { display: inline-flex; flex: 0 0 auto; align-items: center; justify-content: center; gap: .48rem; min-height: 2.65rem; color: #fff; background: var(--cnl-red); box-shadow: 0 .6rem 1.5rem color-mix(in srgb, var(--cnl-red) 24%, transparent); }
button.primary:hover:not(:disabled) { background: var(--cnl-red-strong); }

.settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1rem; margin: 1rem 0; }
.preference-panel { min-width: 0; padding: clamp(1.2rem, 2.5vw, 1.65rem); }
.toggle-list { display: grid; }
.toggle-row, .cache-toggle { position: relative; display: flex; min-height: 3.55rem; align-items: center; justify-content: space-between; gap: 1rem; border-top: 1px solid var(--cnl-line-soft); cursor: pointer; }
.toggle-row > span, .cache-toggle > span { display: grid; min-width: 0; gap: .18rem; }
.toggle-row strong, .cache-toggle strong { font-size: .86rem; font-weight: 680; }
.toggle-row small, .cache-toggle small { color: var(--cnl-muted); font-size: .75rem; line-height: 1.38; }
.toggle-row input, .cache-toggle input { position: absolute; width: 1px; height: 1px; opacity: 0; }
.toggle-row i, .cache-toggle i { position: relative; width: 2rem; height: 1.12rem; flex: 0 0 auto; border-radius: 999px; background: color-mix(in srgb, currentColor 17%, transparent); transition: background .22s ease; }
.toggle-row i::after, .cache-toggle i::after { position: absolute; top: .17rem; left: .18rem; width: .78rem; height: .78rem; border-radius: 50%; background: color-mix(in srgb, currentColor 68%, transparent); content: ""; transition: transform .28s var(--cnl-ease), background .22s ease; }
.toggle-row input:checked + i, .cache-toggle input:checked + i { background: var(--cnl-red); }
.toggle-row input:checked + i::after, .cache-toggle input:checked + i::after { background: #fff; transform: translateX(.86rem); }
.toggle-row input:focus-visible + i, .cache-toggle input:focus-visible + i { outline: 2px solid var(--cnl-red-strong); outline-offset: 3px; }
.conversion-notice { display: flex; align-items: center; justify-content: space-between; gap: .8rem; margin: .55rem 0 .8rem; padding: .62rem .72rem; border-radius: .72rem; color: var(--cnl-muted); background: var(--cnl-faint); font-size: .74rem; line-height: 1.4; }
.conversion-notice[data-state="error"] { color: var(--cnl-red-strong); background: color-mix(in srgb, var(--cnl-red) 9%, transparent); }
.conversion-notice button { flex: 0 0 auto; padding: .28rem .38rem; color: inherit; }
.range-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; padding-top: 1rem; border-top: 1px solid var(--cnl-line-soft); }
.range-field { display: grid; gap: .6rem; }
.range-field.wide { grid-column: 1 / -1; }
.range-field > span { display: flex; align-items: center; justify-content: space-between; gap: 1rem; font-size: .75rem; }
.range-field b { font-weight: 650; }
.range-field output { color: var(--cnl-muted); font-variant-numeric: tabular-nums; }
input[type="range"] { width: 100%; height: 1.3rem; margin: 0; appearance: none; background: transparent; cursor: pointer; }
input[type="range"]::-webkit-slider-runnable-track { height: .3rem; border-radius: 999px; background: linear-gradient(90deg, var(--cnl-red) 0 var(--range-progress), color-mix(in srgb, currentColor 17%, transparent) var(--range-progress) 100%); }
input[type="range"]::-webkit-slider-thumb { width: 1rem; height: 1rem; margin-top: -.35rem; appearance: none; border: .2rem solid color-mix(in srgb, var(--cnl-red) 24%, transparent); border-radius: 50%; background: var(--cnl-red-strong); background-clip: padding-box; box-shadow: 0 .2rem .65rem color-mix(in srgb, var(--cnl-red) 42%, transparent); transition: transform .2s var(--cnl-ease), box-shadow .2s ease; }
input[type="range"]:hover::-webkit-slider-thumb, input[type="range"]:focus-visible::-webkit-slider-thumb { transform: scale(1.16); box-shadow: 0 .25rem .9rem color-mix(in srgb, var(--cnl-red) 58%, transparent); }
input[type="range"]::-moz-range-track { height: .3rem; border-radius: 999px; background: color-mix(in srgb, currentColor 17%, transparent); }
input[type="range"]::-moz-range-progress { height: .3rem; border-radius: 999px; background: var(--cnl-red); }
input[type="range"]::-moz-range-thumb { width: .75rem; height: .75rem; border: .2rem solid color-mix(in srgb, var(--cnl-red) 24%, transparent); border-radius: 50%; background: var(--cnl-red-strong); box-shadow: 0 .2rem .65rem color-mix(in srgb, var(--cnl-red) 42%, transparent); }

.storage-panel { margin-top: 1rem; }
.action-notice { flex: 0 0 auto; color: #39a968; font-size: .76rem; }
.storage-toolbar { display: grid; grid-template-columns: minmax(13rem, 1fr) 9rem auto; align-items: end; gap: 1rem; padding: 1rem; border-radius: 1rem; background: var(--cnl-faint); }
.cache-toggle { min-height: 2.7rem; border: 0; }
.ttl-field .number-stepper b { padding-inline: .5rem .35rem; }
.storage-actions { display: flex; gap: .55rem; }
button.secondary { color: inherit; background: var(--cnl-surface-raised); }
button.secondary:hover { background: color-mix(in srgb, currentColor 12%, transparent); }
button.danger { color: var(--cnl-red-strong); background: color-mix(in srgb, var(--cnl-red) 10%, transparent); }
button.danger:hover { background: color-mix(in srgb, var(--cnl-red) 16%, transparent); }
.mapping-heading { margin-top: 1.25rem; color: var(--cnl-muted); font-size: .72rem; letter-spacing: .02em; }
.mapping-list { display: grid; gap: .46rem; margin-top: .65rem; }
.mapping { display: flex; align-items: center; justify-content: space-between; gap: 1rem; min-height: 2.8rem; padding: .42rem .68rem .42rem .82rem; border-radius: .72rem; background: color-mix(in srgb, currentColor 3.5%, transparent); }
.mapping > div { display: grid; min-width: 0; gap: .12rem; }
.mapping strong { overflow: hidden; font-size: .82rem; text-overflow: ellipsis; white-space: nowrap; }
.mapping span { overflow: hidden; color: var(--cnl-muted); font-size: .72rem; text-overflow: ellipsis; white-space: nowrap; }
button.link { padding: .4rem .55rem; color: var(--cnl-muted); background: transparent; font-size: .74rem; }
button.link:hover { color: var(--cnl-red-strong); background: color-mix(in srgb, var(--cnl-red) 8%, transparent); }
.empty { margin: .72rem 0 0; padding: .8rem; color: var(--cnl-muted); font-size: .8rem; text-align: center; }

.diagnostics-panel { margin-top: 1rem; overflow: clip; }
.diagnostics-panel summary { display: flex; align-items: center; justify-content: space-between; gap: 1.5rem; padding: 1.3rem 1.55rem; cursor: pointer; list-style: none; }
.diagnostics-panel summary::-webkit-details-marker { display: none; }
.summary-copy { display: grid; gap: .3rem; }
.summary-copy > strong { font-size: 1rem; }
.summary-copy > small { color: var(--cnl-muted); font-size: .78rem; line-height: 1.45; }
.summary-arrow { display: grid; width: 2rem; height: 2rem; flex: 0 0 auto; place-items: center; border-radius: 50%; background: var(--cnl-faint); transition: transform .28s var(--cnl-ease); }
.diagnostics-panel[open] .summary-arrow { transform: rotate(180deg); }
.diagnostics-content { padding: 0 1.55rem 1.4rem; }
.diagnostics { display: grid; grid-template-columns: minmax(10rem, .28fr) minmax(0, 1fr); margin: 0; border-top: 1px solid var(--cnl-line-soft); }
.diagnostics dt, .diagnostics dd { margin: 0; padding: .66rem 0; border-bottom: 1px solid var(--cnl-line-soft); }
.diagnostics dt { padding-right: 1rem; color: var(--cnl-muted); font-size: .74rem; }
.diagnostics dd { min-width: 0; font-size: .78rem; }
pre { margin: 0; overflow: auto; font: inherit; white-space: pre-wrap; overflow-wrap: anywhere; }
.probe { display: grid; grid-template-columns: minmax(10rem, .28fr) minmax(0, 1fr); gap: .55rem 0; margin-top: 1rem; font-size: .76rem; }
.probe strong { padding-right: 1rem; }
.probe span { color: var(--cnl-muted); overflow-wrap: anywhere; }

.privacy-note { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: start; gap: .9rem; margin-top: 1.3rem; padding: 1rem .2rem; color: var(--cnl-muted); }
.privacy-icon { display: grid; width: 1.65rem; height: 1.65rem; place-items: center; border: 1px solid var(--cnl-line); border-radius: 50%; color: var(--cnl-red-strong); font-size: .78rem; }
.privacy-note strong { color: color-mix(in srgb, currentColor 84%, transparent); font-size: .78rem; }
.privacy-note p { max-width: 54rem; margin: .22rem 0 0; font-size: .73rem; line-height: 1.5; }
.privacy-note a { color: inherit; font-size: .74rem; text-decoration: none; white-space: nowrap; }
.privacy-note a:hover { color: var(--cnl-red-strong); }

@keyframes pulse { 50% { opacity: .25; transform: scale(.72); } }
@media (prefers-reduced-motion: reduce) { *, *::before, *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; animation-iteration-count: 1 !important; } }
@media (max-width: 860px) {
  .settings-grid, .mode-grid { grid-template-columns: 1fr; }
  .storage-toolbar { grid-template-columns: minmax(0, 1fr) 9rem; }
  .storage-actions { grid-column: 1 / -1; }
}
@media (max-width: 640px) {
  .settings { padding-inline: .85rem; }
  .hero { flex-direction: column; gap: 1.35rem; }
  .hero-tools { width: 100%; min-width: 0; align-items: flex-start; }
  .language-picker { max-width: 18rem; }
  .section-heading { flex-direction: column; gap: .8rem; }
  .status { max-width: 100%; }
  .connection-footer, .storage-actions { align-items: stretch; flex-direction: column; }
  .gateway-field, .timeout-field { width: 100%; flex-basis: auto; }
  button.primary { width: 100%; }
  .range-grid, .storage-toolbar { grid-template-columns: 1fr; }
  .diagnostics, .probe { grid-template-columns: 1fr; }
  .diagnostics dt { padding-bottom: .15rem; border-bottom: 0; }
  .diagnostics dd { padding-top: .15rem; }
  .privacy-note { grid-template-columns: auto minmax(0, 1fr); }
  .privacy-note a { grid-column: 2; }
}
</style>
