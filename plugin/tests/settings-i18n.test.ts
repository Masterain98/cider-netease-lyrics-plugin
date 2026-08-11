import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { normalizeLocale, resolveLocale, settingsMessages, translate } from "../src/i18n/settings-i18n";

function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([^}]+)\}/gu)].map((match) => match[1] ?? "").sort();
}

describe("settings localization", () => {
  it("maps Cider language variants to a supported locale", () => {
    expect(normalizeLocale("zh-CN")).toBe("zh-CN");
    expect(normalizeLocale("zh_Hans")).toBe("zh-CN");
    expect(normalizeLocale("zh-TW")).toBe("zh-TW");
    expect(normalizeLocale("zh-Hant-HK")).toBe("zh-TW");
    expect(normalizeLocale("ja")).toBe("en-US");
  });

  it("follows Cider in auto mode and respects an explicit override", () => {
    expect(resolveLocale("auto", "zh-TW")).toBe("zh-TW");
    expect(resolveLocale("en-US", "zh-CN")).toBe("en-US");
  });

  it("keeps every locale catalog in sync and interpolates values", () => {
    const expectedKeys = Object.keys(settingsMessages["zh-CN"]).sort();
    expect(Object.keys(settingsMessages["zh-TW"]).sort()).toEqual(expectedKeys);
    expect(Object.keys(settingsMessages["en-US"]).sort()).toEqual(expectedKeys);
    expect(translate("en-US", "storage.mappingCount", { count: 3 })).toBe("3 saved matches");
  });

  it("keeps placeholders aligned and every translated message non-empty", () => {
    const reference = settingsMessages["zh-CN"];
    for (const key of Object.keys(reference) as Array<keyof typeof reference>) {
      const expectedPlaceholders = placeholders(reference[key]);
      for (const locale of ["zh-CN", "zh-TW", "en-US"] as const) {
        expect(settingsMessages[locale][key].trim(), `${locale}:${key}`).not.toBe("");
        expect(placeholders(settingsMessages[locale][key]), `${locale}:${key}`).toEqual(expectedPlaceholders);
      }
    }
  });

  it("translates immersive controls in every supported locale", () => {
    expect(translate("zh-CN", "lyrics.resumeFollowing")).toBe("回到当前歌词");
    expect(translate("zh-TW", "lyrics.resumeFollowing")).toBe("回到目前歌詞");
    expect(translate("en-US", "lyrics.resumeFollowing")).toBe("Return to current lyric");
    expect(translate("en-US", "matchChooser.search")).toBe("Search");
    expect(translate("zh-TW", "player.progressValue", { current: "1:02", remaining: "2:34" })).toBe("1:02，剩餘 2:34");
  });

  it("does not leave human-language copy in production Vue templates", () => {
    const componentsDirectory = fileURLToPath(new URL("../src/components/", import.meta.url));
    const allowedText = new Set(["A−", "A＋", "NETEASE LYRICS"]);
    const findings: string[] = [];

    for (const entry of readdirSync(componentsDirectory, { withFileTypes: true })) {
      if (!entry.isFile() || !entry.name.endsWith(".vue")) continue;
      const source = readFileSync(fileURLToPath(new URL(`../src/components/${entry.name}`, import.meta.url)), "utf8");
      const template = source.match(/<template>([\s\S]*?)<\/template>/u)?.[1] ?? "";

      for (const match of template.matchAll(/(?<!:)\b(?:aria-label|placeholder|title|data-tooltip)="([^"]*[A-Za-z\u3400-\u9fff][^"]*)"/gu)) {
        findings.push(`${entry.name}: unlocalized attribute “${match[1]}”`);
      }
      for (const match of template.matchAll(/>\s*([^<>{}\n]*[A-Za-z\u3400-\u9fff][^<>{}\n]*)\s*</gu)) {
        const text = match[1]?.trim() ?? "";
        if (text && !allowedText.has(text)) findings.push(`${entry.name}: unlocalized text “${text}”`);
      }
      if (/\p{Script=Han}/u.test(template)) findings.push(`${entry.name}: contains a hard-coded Han character`);
    }

    expect(findings).toEqual([]);
  });
});
