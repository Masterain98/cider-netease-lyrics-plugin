import { saveConfig } from "@ciderapp/pluginkit";
import { ref } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bindSettings, DEFAULT_SETTINGS, migrateSettings, settings } from "../src/stores/settings-store";

afterEach(() => {
  vi.useRealTimers();
  vi.mocked(saveConfig).mockClear();
});

describe("plugin settings persistence", () => {
  it("defaults new and legacy configurations to direct while preserving a gateway URL", () => {
    expect(DEFAULT_SETTINGS.connectionMode).toBe("direct");
    expect(DEFAULT_SETTINGS.locale).toBe("auto");
    expect(migrateSettings({ gatewayUrl: "https://kept.example" })).toMatchObject({
      connectionMode: "direct",
      locale: "auto",
      gatewayUrl: "https://kept.example",
    });
    expect(migrateSettings({ connectionMode: "gateway", gatewayUrl: "https://chosen.example" })).toMatchObject({
      connectionMode: "gateway",
      gatewayUrl: "https://chosen.example",
    });
    expect(migrateSettings({ locale: "zh-TW" }).locale).toBe("zh-TW");
    expect(migrateSettings({ locale: "unsupported" as never }).locale).toBe("auto");
    expect(migrateSettings({ lyricScale: 1.1 }).lyricScale).toBe(1.1);
    expect(migrateSettings({ lyricScale: 1.1 }).originalFontSize).toBe(1.1);
    expect(migrateSettings({ originalFontSize: 0.85, translationFontSize: 0.8 })).toMatchObject({
      originalFontSize: 0.85,
      translationFontSize: 0.8,
      lyricScale: 0.85,
    });
    expect(migrateSettings({ lyricScale: 4 }).lyricScale).toBe(1.2);
    expect(migrateSettings({ lyricScale: Number.NaN }).lyricScale).toBe(1);
    expect(migrateSettings({ originalFontSize: 4, translationFontSize: 0.1 })).toMatchObject({
      originalFontSize: 1.2,
      translationFontSize: 0.45,
    });
  });

  it("loads the host config and debounces local changes back to PluginKit", async () => {
    vi.useFakeTimers();
    const config = ref({ ...DEFAULT_SETTINGS, autoMatch: false, gatewayUrl: "https://gateway.example" });
    bindSettings(config);

    expect(settings.autoMatch).toBe(false);
    expect(settings.gatewayUrl).toBe("https://gateway.example");

    settings.autoMatch = true;
    settings.requestTimeoutMs = 9_000;
    await vi.advanceTimersByTimeAsync(301);

    expect(config.value).toMatchObject({ autoMatch: true, requestTimeoutMs: 9_000 });
    expect(saveConfig).toHaveBeenCalledTimes(1);
  });
});
