import { addImmersiveLayout, definePluginContext, removeImmersiveLayout } from "@ciderapp/pluginkit";
import { defineCustomElement } from "vue";
import NetEaseLyricsLayout from "./components/NetEaseLyricsLayout.vue";
import PluginSettings from "./components/PluginSettings.vue";
import pluginConfig from "./plugin.config";
import { lyricController } from "./stores/lyric-store";
import { bindSettings, DEFAULT_SETTINGS, type PluginSettings as Settings } from "./stores/settings-store";

export const CustomElements = {
  settings: defineCustomElement(PluginSettings, { shadowRoot: false }),
  "immersive-layout": defineCustomElement(NetEaseLyricsLayout, { shadowRoot: false }),
};

const immersiveLayout = {
  name: "NetEase Bilingual Lyrics",
  identifier: "dev.masterain.cider-netease-lyrics.immersive",
  component: "",
  type: "normal" as const,
};

let setupComplete = false;
const context = definePluginContext({
  ...pluginConfig,
  CustomElements,
  setup() {
    if (setupComplete) return;
    setupComplete = true;
    for (const [name, constructor] of Object.entries(CustomElements)) {
      const tag = context.customElementName(name);
      if (!customElements.get(tag)) customElements.define(tag, constructor);
    }
    immersiveLayout.component = context.customElementName("immersive-layout");
    addImmersiveLayout(immersiveLayout);
    lyricController.start();
    window.addEventListener(
      "beforeunload",
      () => {
        lyricController.stop();
        removeImmersiveLayout(immersiveLayout);
      },
      { once: true },
    );
  },
});

const config = context.setupConfig<Settings>({ ...DEFAULT_SETTINGS });
bindSettings(config);
context.plugin.SettingsElement = context.customElementName("settings");

export const { setupConfig, customElementName, goToPage, useCPlugin } = context;
export default context.plugin;
