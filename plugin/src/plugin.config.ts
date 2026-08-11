import packageJson from "../package.json";

export default {
  ce_prefix: "cnl",
  // Stable Cider identity; changing it would detach existing settings and mappings.
  identifier: "dev.masterain.cider-netease-lyrics",
  pluginKitVersion: "4.0.0",
  name: "NetEase Bilingual Lyrics",
  description: "Line-synced original and Chinese NetEase lyrics in a Cider immersive layout.",
  version: packageJson.version,
  author: "Masterain98",
  repo: "https://github.com/Masterain98/cider-netease-lyrics",
  entry: {
    "plugin.js": { type: "main" },
  },
};
