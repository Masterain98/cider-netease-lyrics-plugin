import { saveConfig } from "@ciderapp/pluginkit";
import { reactive, watch, type Ref } from "vue";

export type ConnectionMode = "direct" | "gateway";
export type SettingsLocale = "auto" | "zh-CN" | "zh-TW" | "en-US";

export interface PluginSettings {
  locale: SettingsLocale;
  autoMatch: boolean;
  connectionMode: ConnectionMode;
  gatewayUrl: string;
  requestTimeoutMs: number;
  showOriginal: boolean;
  showTranslation: boolean;
  chineseTranslationOnly: boolean;
  convertLyricsToTraditional: boolean;
  originalFontSize: number;
  lyricScale: number;
  translationFontSize: number;
  translationOpacity: number;
  autoScroll: boolean;
  allowSeek: boolean;
  cacheEnabled: boolean;
  cacheTtlDays: number;
}

export type StoredPluginSettings = Omit<PluginSettings, "convertLyricsToTraditional"> & {
  // Null is a one-time migration sentinel resolved from the effective UI locale.
  convertLyricsToTraditional: boolean | null;
};

export const DEFAULT_SETTINGS: PluginSettings = {
  locale: "auto",
  autoMatch: true,
  connectionMode: "direct",
  gatewayUrl: "http://127.0.0.1:3100",
  requestTimeoutMs: 7_000,
  showOriginal: true,
  showTranslation: true,
  chineseTranslationOnly: true,
  convertLyricsToTraditional: false,
  originalFontSize: 1,
  lyricScale: 1,
  translationFontSize: 0.62,
  translationOpacity: 0.72,
  autoScroll: true,
  allowSeek: true,
  cacheEnabled: true,
  cacheTtlDays: 14,
};

export const STORED_DEFAULT_SETTINGS: StoredPluginSettings = {
  ...DEFAULT_SETTINGS,
  convertLyricsToTraditional: null,
};

export const settings = reactive<PluginSettings>({ ...DEFAULT_SETTINGS });
let bound = false;

export function migrateSettings(
  value: Partial<StoredPluginSettings>,
  defaultTraditionalLyrics = false,
): PluginSettings {
  const supportedLocales: SettingsLocale[] = ["auto", "zh-CN", "zh-TW", "en-US"];
  const legacyLyricScale = typeof value.lyricScale === "number" && Number.isFinite(value.lyricScale)
    ? Math.min(1.2, Math.max(0.8, value.lyricScale))
    : DEFAULT_SETTINGS.lyricScale;
  const originalFontSize = typeof value.originalFontSize === "number" && Number.isFinite(value.originalFontSize)
    ? Math.min(1.2, Math.max(0.8, value.originalFontSize))
    : legacyLyricScale;
  const translationFontSize = typeof value.translationFontSize === "number" && Number.isFinite(value.translationFontSize)
    ? Math.min(0.9, Math.max(0.45, value.translationFontSize))
    : DEFAULT_SETTINGS.translationFontSize;
  return {
    ...DEFAULT_SETTINGS,
    ...value,
    locale: supportedLocales.includes(value.locale as SettingsLocale) ? value.locale as SettingsLocale : "auto",
    connectionMode: value.connectionMode === "gateway" ? "gateway" : "direct",
    convertLyricsToTraditional: typeof value.convertLyricsToTraditional === "boolean"
      ? value.convertLyricsToTraditional
      : defaultTraditionalLyrics,
    originalFontSize,
    // Keep the legacy field populated so older Cider config snapshots remain readable.
    lyricScale: originalFontSize,
    translationFontSize,
  };
}

export function bindSettings(config: Ref<StoredPluginSettings>, defaultTraditionalLyrics = false): void {
  if (bound) return;
  bound = true;
  const needsTraditionalLyricsInitialization = typeof config.value.convertLyricsToTraditional !== "boolean";
  Object.assign(settings, migrateSettings(config.value, defaultTraditionalLyrics));
  Object.assign(config.value, settings);
  if (needsTraditionalLyricsInitialization) void saveConfig();
  let saveTimer: ReturnType<typeof setTimeout> | undefined;
  watch(
    settings,
    (value) => {
      Object.assign(config.value, value);
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => void saveConfig(), 300);
    },
    { deep: true },
  );
}
