import type { LyricLine } from "@cider-netease/shared";
import { reactive } from "vue";

type ConverterFunction = (text: string) => string;

export interface OpenCCModule {
  default: {
    Converter(options: { from: "cn"; to: "tw" }): ConverterFunction;
  };
}

export type OpenCCLoader = () => Promise<OpenCCModule>;
export type TraditionalLyricsStatus = "idle" | "loading" | "ready" | "error";

const defaultLoader: OpenCCLoader = () => import("opencc-js/cn2t");

export class TraditionalLyricsConverter {
  readonly state = reactive<{ status: TraditionalLyricsStatus }>({ status: "idle" });

  private converter: ConverterFunction | undefined;
  private pending: Promise<void> | undefined;

  constructor(private readonly loader: OpenCCLoader = defaultLoader) {}

  load(): Promise<void> {
    if (this.converter) return Promise.resolve();
    if (this.pending) return this.pending;

    this.state.status = "loading";
    const pending = this.loader()
      .then((module) => {
        this.converter = module.default.Converter({ from: "cn", to: "tw" });
        this.state.status = "ready";
      })
      .catch((error: unknown) => {
        this.state.status = "error";
        throw error;
      })
      .finally(() => {
        if (this.pending === pending) this.pending = undefined;
      });
    this.pending = pending;
    return pending;
  }

  retry(): Promise<void> {
    if (this.state.status === "error") this.state.status = "idle";
    return this.load();
  }

  convertText(text: string): string {
    return this.converter?.(text) ?? text;
  }

  convertLines(lines: LyricLine[]): LyricLine[] {
    if (!this.converter) return lines;
    return lines.map((line) => this.convertLine(line));
  }

  private convertLine(line: LyricLine): LyricLine {
    return {
      ...line,
      text: this.convertText(line.text),
      ...(line.translation !== undefined ? { translation: this.convertText(line.translation) } : {}),
      words: line.words.map((word) => this.convertLine(word)),
    };
  }
}

export const traditionalLyricsConverter = new TraditionalLyricsConverter();
