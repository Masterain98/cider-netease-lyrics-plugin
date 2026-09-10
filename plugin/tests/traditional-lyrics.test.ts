import type { LyricLine } from "@cider-netease/shared";
import { describe, expect, it, vi } from "vitest";
import {
  TraditionalLyricsConverter,
  type OpenCCLoader,
  type OpenCCModule,
} from "../src/utils/traditional-lyrics";

function moduleWith(converter: (text: string) => string): OpenCCModule {
  return { default: { Converter: () => converter } };
}

describe("traditional lyric conversion", () => {
  it("uses the Taiwan glyph preset without Taiwan phrase replacement", async () => {
    const service = new TraditionalLyricsConverter();
    await service.load();

    expect(service.convertText("汉语 发型 软件 后台")).toBe("漢語 髮型 軟件 後臺");
    expect(service.convertText("雲雀 ASCA 2026！")).toBe("雲雀 ASCA 2026！");
    expect(service.convertText("かなカナ・日本語。Hello!"))
      .toBe("かなカナ・日本語。Hello!");
  });

  it("converts display text while preserving source lines and timing", async () => {
    const service = new TraditionalLyricsConverter(async () => moduleWith((text) => text.replaceAll("云", "雲")));
    const word: LyricLine = { start: 1, end: 2, text: "云", words: [], empty: false };
    const line: LyricLine = {
      start: 1,
      end: 4,
      text: "云雀",
      translation: "云端",
      words: [word],
      empty: false,
      index: 3,
      isCredit: true,
    };

    const sourceLines = [line];
    expect(service.convertLines(sourceLines)).toBe(sourceLines);
    await service.load();
    const [converted] = service.convertLines([line]);

    expect(converted).toMatchObject({
      start: 1,
      end: 4,
      text: "雲雀",
      translation: "雲端",
      empty: false,
      index: 3,
      isCredit: true,
    });
    expect(converted?.words[0]).toMatchObject({ start: 1, end: 2, text: "雲" });
    expect(line.text).toBe("云雀");
    expect(line.translation).toBe("云端");
    expect(line.words[0]?.text).toBe("云");
  });

  it("deduplicates concurrent loads and permits retry after failure", async () => {
    let resolveLoad: ((module: OpenCCModule) => void) | undefined;
    const loader = vi.fn<OpenCCLoader>(() => new Promise((resolve) => { resolveLoad = resolve; }));
    const service = new TraditionalLyricsConverter(loader);

    const first = service.load();
    const second = service.load();
    expect(loader).toHaveBeenCalledTimes(1);
    expect(service.state.status).toBe("loading");
    resolveLoad?.(moduleWith((text) => text));
    await Promise.all([first, second]);
    expect(service.state.status).toBe("ready");

    const failingLoader = vi.fn<OpenCCLoader>()
      .mockRejectedValueOnce(new Error("missing chunk"))
      .mockResolvedValueOnce(moduleWith((text) => `converted:${text}`));
    const retryingService = new TraditionalLyricsConverter(failingLoader);
    await expect(retryingService.load()).rejects.toThrow("missing chunk");
    expect(retryingService.state.status).toBe("error");
    expect(retryingService.convertText("raw")).toBe("raw");
    await retryingService.retry();
    expect(retryingService.state.status).toBe("ready");
    expect(retryingService.convertText("raw")).toBe("converted:raw");
  });
});
