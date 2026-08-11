import { createApp, reactive } from "vue";

const PREVIEW_ARTWORK_URL = `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="360" height="240" viewBox="0 0 360 240"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#32131d"/><stop offset=".52" stop-color="#a62b43"/><stop offset="1" stop-color="#130a12"/></linearGradient><radialGradient id="r" cx=".7" cy=".2"><stop stop-color="#ffd8cb" stop-opacity=".9"/><stop offset="1" stop-color="#ffd8cb" stop-opacity="0"/></radialGradient></defs><rect width="360" height="240" fill="url(#g)"/><rect width="360" height="240" fill="url(#r)"/><circle cx="110" cy="112" r="72" fill="#ff4058" fill-opacity=".24"/><path d="M32 204 138 76l62 68 38-52 91 112H32Z" fill="#0d0a12" fill-opacity=".48"/><text x="26" y="45" fill="#fff" fill-opacity=".72" font-family="Arial" font-size="12" letter-spacing="4">NIGHT SIGNALS</text><text x="26" y="199" fill="#fff" font-family="Arial" font-size="34" font-weight="700">NORTH</text></svg>`)}`;

class PreviewArtwork extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="preview-artwork-frame"><img class="preview-artwork-image" src="${PREVIEW_ARTWORK_URL}" alt=""><div class="preview-artwork-title">NORTH<br><span>LIGHT</span></div></div><style>.preview-artwork-frame{position:relative;width:100%;height:100%;overflow:hidden;background:#120b11}.preview-artwork-image{display:block;width:100%;height:100%;object-fit:cover;object-position:center}.preview-artwork-title{position:absolute;inset:auto 8% 9%;color:#fff;font:720 clamp(2rem,6vw,5.4rem)/.9 Figtree,sans-serif;letter-spacing:-.07em;text-shadow:0 .2rem 1rem #0008}.preview-artwork-title span{color:#ff4058}</style>`;
  }
}

class PreviewControls extends HTMLElement {
  connectedCallback() {
    const slottedChildren = Array.from(this.children);
    this.innerHTML = `<style>cider-lcdplayer-glass button{display:grid;place-items:center;width:2rem;height:2rem;border:0;border-radius:50%;color:#ffffffb8;background:transparent;font:600 .72rem/1 Figtree,sans-serif;cursor:pointer}cider-lcdplayer-glass .playback-controls,cider-lcdplayer-glass .am-playback-actions{display:flex;align-items:center;gap:.38rem}cider-lcdplayer-glass .preview-play{width:2.65rem;height:2.65rem;margin-inline:.24rem;color:#241014;background:#fff;font-size:.85rem}cider-lcdplayer-glass .lcdplayer-side{display:flex;align-items:center;gap:.18rem}</style><div class="lcd-player-glass"><div class="lcdplayer-top"><div class="lcdplayer-controls"><div class="playback-controls"><div class="am-playback-actions"><button type="button" class="playback-action-button" aria-label="随机播放">↝</button><button type="button" class="playback-action-button" aria-label="上一首">◀</button><button type="button" class="playback-action-button preview-play" aria-label="播放">▶</button><button type="button" class="playback-action-button" aria-label="下一首">▶</button><button type="button" class="playback-action-button" aria-label="重复播放">↻</button></div></div></div><div class="lcdplayer-info"></div><div class="lcdplayer-side"><button type="button" class="toolbar-btn" aria-label="音量">⌁</button><button type="button" class="toolbar-btn" aria-label="全屏">↗</button></div></div></div>`;
    const side = this.querySelector(".lcdplayer-side");
    for (const child of slottedChildren.reverse()) side?.prepend(child);
  }
}

class PreviewGlassActions extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="item-actions"><button type="button" aria-label="加入资料库">＋</button><button type="button" class="toolbar-btn mediaitem-rating" aria-label="收藏"><span name="ion-ios-star-outline" color="default">☆</span></button><button type="button" aria-label="加入播放列表">•••</button></div>`;
    const favorite = this.querySelector<HTMLButtonElement>("[aria-label='收藏']");
    favorite?.addEventListener("click", () => {
      const active = favorite.getAttribute("aria-pressed") === "true";
      favorite.setAttribute("aria-pressed", String(!active));
      const player = window.CiderApp?.musicKitStore?.player;
      if (player) player.inFavorites = !active;
      const icon = favorite.querySelector("[name*='star']");
      icon?.setAttribute("name", active ? "ion-ios-star-outline" : "ion-ios-star");
      icon?.setAttribute("color", active ? "default" : "primary");
      if (icon) icon.textContent = active ? "☆" : "★";
    });
  }
}

class PreviewQueue extends HTMLElement {
  private currentTab = "queue";

  set selectTab(value: string) {
    this.currentTab = value || "queue";
    this.render();
  }

  get selectTab() {
    return this.currentTab;
  }

  connectedCallback() {
    this.currentTab = this.getAttribute("select-tab") || this.currentTab;
    this.render();
  }

  private render() {
    if (!this.isConnected) return;
    const queueItems = [
      ["夜を越えて", "Aimer · Walpurgis", "4:12"],
      ["花の唄", "Aimer · Penny Rain", "6:13"],
      ["春はゆく", "Aimer · Walpurgis", "5:07"],
      ["I beg you", "Aimer · Sun Dance", "4:27"],
    ];
    const historyItems = [
      ["雲雀", "ASCA · RUST / 雲雀 / 光芒", "刚刚"],
      ["Ref:rain", "Aimer · Penny Rain", "8 分钟前"],
      ["Brave Shine", "Aimer · DAWN", "14 分钟前"],
      ["LAST STARDUST", "Aimer · DAWN", "19 分钟前"],
    ];
    const items = this.currentTab === "history" ? historyItems : queueItems;
    const title = this.currentTab === "history" ? "历史记录" : "接下来播放";
    this.innerHTML = `<section class="queue-layout"><header class="queue-header"><strong>${title}</strong><span>${items.length} 首</span></header><div class="queue-item-list">${items.map(([name, detail, tail], index) => `<article class="preview-queue-item"><span class="queue-index">${String(index + 1).padStart(2, "0")}</span><img class="queue-artwork" src="${PREVIEW_ARTWORK_URL}" alt=""><div><b>${name}</b><small>${detail}</small></div><time>${tail}</time></article>`).join("")}</div></section><style>.queue-layout{height:100%;overflow:hidden}.queue-header{display:flex;align-items:center;justify-content:space-between}.queue-header strong{font-size:.85rem}.queue-header span{opacity:.42;font-size:.68rem}.queue-item-list{display:grid;padding:.45rem}.preview-queue-item{display:grid;grid-template-columns:2rem 2.3rem minmax(0,1fr) auto;align-items:center;gap:.7rem;padding:.72rem .65rem;border-radius:.85rem;color:#ffffffb8}.preview-queue-item:hover{background:#ffffff0e}.queue-index{opacity:.28;font:600 .65rem/1 ui-monospace,monospace}.queue-artwork{display:block;width:2.3rem;height:2.3rem;min-width:2.3rem;min-height:2.3rem;border-radius:.52rem;object-fit:cover;object-position:center}.preview-queue-item div{display:grid;gap:.2rem;min-width:0}.preview-queue-item b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.78rem}.preview-queue-item small{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;opacity:.46;font-size:.66rem}.preview-queue-item time{opacity:.4;font-size:.64rem}</style>`;
  }
}

class PreviewNativeLyrics extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `<div class="preview-native-lyrics"><p>呼び合っているような</p><p>雲雀の声だけ遠く</p><p class="active">ねえ　本当はいつだって光の中にいたよね</p><p>辿りつきたい　ところがあるの</p><p>愛の形を　見つけにゆくの</p></div><style>.preview-native-lyrics{height:100%;box-sizing:border-box;overflow:hidden;padding:18vh clamp(2rem,5vw,5rem);mask-image:linear-gradient(transparent,#000 14%,#000 82%,transparent);color:#ffffff42;font:680 clamp(1.4rem,3.1vw,3.2rem)/1.35 Figtree,sans-serif;letter-spacing:-.035em}.preview-native-lyrics p{max-width:22ch;margin:0 0 1.2rem}.preview-native-lyrics .active{color:#fff;text-shadow:0 0 1.5rem #fff5}</style>`;
    queueMicrotask(() => this.dispatchEvent(new CustomEvent("has-lyrics")));
  }
}

if (!customElements.get("cider-immersive-artwork")) customElements.define("cider-immersive-artwork", PreviewArtwork);
if (!customElements.get("cider-lcdplayer-glass")) customElements.define("cider-lcdplayer-glass", PreviewControls);
if (!customElements.get("cider-glass-player-actions")) customElements.define("cider-glass-player-actions", PreviewGlassActions);
if (!customElements.get("cider-amqueue")) customElements.define("cider-amqueue", PreviewQueue);
if (!customElements.get("cider-immersive-lyric-view")) customElements.define("cider-immersive-lyric-view", PreviewNativeLyrics);

const previewAudio = { currentTime: 32 } as HTMLAudioElement;
const previewHostConfig = reactive({ audio: { ciderAudio: { enabled: true, ciderPPE: true, spatial: false } }, general: { language: "zh-CN" } });
Object.assign(window, {
  CiderApp: {
    config: { getRef: () => previewHostConfig, async saveConfig() {} },
    musicKitStore: { player: { mediaElement: previewAudio, inFavorites: false } },
  },
  CiderAudio: { hierarchical_loading() {} },
});
const previewAppleMusicStore = {
  audioElement: previewAudio,
  nowPlayingItem: { attributes: { artwork: { url: PREVIEW_ARTWORK_URL } } },
};
window.__PLUGINSYS__ = {
  Stores: { appleMusicStore: previewAppleMusicStore },
  Components: {
    Lyrics: {},
    ImmersiveLayouts: {
      addLayout() {}, removeLayout() {}, layouts: [],
    } as never,
  },
  ExternalMessages: { addEventListener() {}, removeEventListener() {}, dispatchEvent() {} },
  PAPIInstance: { addEventListener() {}, removeEventListener() {} },
  Dialog: {},
  ContextMenu: {},
  Composables: { useContextMenu() {} },
} as never;
const { lyricState } = await import("./stores/lyric-store");
lyricState.track = { appleMusicId: "demo-northern-lights", title: "云雀", artist: "ASCA", album: "RUST / 云雀 / 光芒", durationMs: 295_502 };
lyricState.status = "ready";
lyricState.lyricDiagnostics = {
  fields: { lrc: true, tlyric: true, romalrc: false, yrc: false },
  unmatchedTranslations: [],
  translationCjkRatio: 0.92,
  translationIsChinese: true,
  parsedRomanizationLines: 0,
};
lyricState.lyrics = {
  type: "Line",
  source: "NetEase",
  neteaseId: "12345678",
  lyrics: [
    { start: 0, end: 8, text: "大事なものは　ひとつじゃないの", translation: "珍贵的宝物并非是唯一的", words: [], empty: false },
    { start: 8, end: 16, text: "呼び合っているような　雲雀の声だけ遠く", translation: "如同呼唤彼此的云雀般 只有遥远的啼鸣", words: [], empty: false },
    { start: 16, end: 24, text: "雲の向こうへ　草原に優しい影を残して", translation: "在云之彼方的草原上 留下温柔的掠影", words: [], empty: false },
    { start: 24, end: 38, text: "ねえ　本当はいつだって光の中にいたよね", translation: "其实一直都存在于光芒之中吧", words: [], empty: false },
    { start: 38, end: 47, text: "辿りつきたい　ところがあるの", translation: "心中想要抵达的地方", words: [], empty: false },
    { start: 47, end: 56, text: "愛の形を　見つけにゆくの", translation: "前去寻找爱的形迹吧", words: [], empty: false },
    { start: 56, end: 65, text: "もう一度だけ　名前を呼んで", translation: "请再一次呼唤我的名字", words: [], empty: false },
    { start: 65, end: 73, text: "夜が明けるまで　そばにいるから", translation: "我会陪在你身边直到天明", words: [], empty: false },
    { start: 73, end: 82, text: "同じ光を　抱いて歩こう", translation: "怀抱着同一束光继续前行", words: [], empty: false },
  ],
};
if (new URLSearchParams(window.location.search).get("view") === "settings") {
  document.documentElement.style.overflow = "auto";
  document.body.style.overflow = "auto";
  document.body.style.color = "#f7f4f5";
  document.body.style.background = "#0d0c0f";
  const { default: PluginSettings } = await import("./components/PluginSettings.vue");
  createApp(PluginSettings).mount("#app");
} else {
  const { default: NetEaseLyricsLayout } = await import("./components/NetEaseLyricsLayout.vue");
  createApp(NetEaseLyricsLayout).mount("#app");
}
