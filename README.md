# NetEase Bilingual Lyrics for Cider

[简体中文](README_CN.md)

<p align="center">
  <img src="https://github.com/user-attachments/assets/f9630407-2fae-4f47-a377-508c7f3f320b" alt="Cider Netease Lyrics Plugin Screenshot" width="800"/>
</p>

Bring line-synced NetEase Cloud Music lyrics and translations into a purpose-built immersive player for Cider 3.1 and later, including Cider 4.

The layout keeps the album, lyrics, playback controls, queue, and listening history together without turning the player into a settings screen. Its translucent glass surfaces also follow the immersive background selected in Cider.

## Highlights

- **Original lyrics and translations together.** Follow both lines in sync, change their sizes independently, hide either layer, or click a line to seek.
- **Matching that stays out of the way.** Songs are matched automatically. When a result is wrong, choose another candidate or edit the title, artist, and album used for a custom match.
- **A graceful fallback.** Switch back to Apple Music lyrics whenever a suitable NetEase result is unavailable.
- **Useful controls where you need them.** Translation, lyric sizing, rematching, Cider Audio DSP, Spatialization, favorites, volume, and playback controls remain available inside immersive mode.
- **More than a lyric view.** Move between lyrics, Up Next, and listening history without leaving the player.
- **Artwork that feels continuous.** The previous cover stays visible while the next one loads, then gives way through a directional liquid transition.
- **Made for different languages.** The plugin interface supports English, Simplified Chinese, and Traditional Chinese, or can follow Cider's language.
- **Local by default.** Settings, lyric cache, and manual matches stay on this device. No NetEase account, password, or cookie is requested.

## Install

This plugin supports Cider 3.1 and later, including Cider 4.

1. Download the ZIP from the [latest release](https://github.com/Masterain98/cider-netease-lyrics/releases/latest).
2. Install the ZIP in Cider's plugin manager and enable the plugin.
3. Open immersive mode and select **NetEase Bilingual Lyrics**.

The plugin connects to NetEase directly by default. If direct access is unavailable on your network, select the optional custom gateway in plugin settings.

## Everyday use

Open the right-side tool rail in immersive mode to change lyric visibility, adjust original and translated text separately, or rematch the current song. The top switcher opens the lyric view, Up Next, or listening history. Preferences and successful manual matches are remembered locally.

Lyrics and translations depend on what NetEase Cloud Music makes available. Direct access may also vary by network or region. The plugin adds its own immersive layout and does not replace lyrics in Cider's other layouts.

## Contributing

Development setup, validation, packaging, and release conventions are documented in [CONTRIBUTING.md](CONTRIBUTING.md). Product and interaction decisions live in [DESIGN.md](DESIGN.md).

## License

[MIT](LICENSE) © Masterain98
