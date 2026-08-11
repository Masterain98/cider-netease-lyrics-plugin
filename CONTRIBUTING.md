# Contributing

Thanks for helping improve NetEase Bilingual Lyrics for Cider. Please keep changes focused, user-facing behavior intentional, and Cider integration defensive.

## Prerequisites

- Node.js 22 or newer
- pnpm 11.18.0 through Corepack
- PowerShell 7 for release packaging
- Cider 3.1 or later for host integration checks; verify Cider 4 behavior for host-version-sensitive changes

## Setup

```powershell
corepack enable
pnpm install
pnpm dev:plugin
```

The plugin development server exposes the browser preview. Use the default route for the immersive layout and `?view=settings` for settings. The preview is a visual test harness, not experimental release code.

## Repository layout

- `plugin/` contains the Cider plugin, Vue UI, host adapters, localization, and plugin tests.
- `packages/shared/` contains lyric parsing, matching, and transport-neutral contracts.
- `gateway/` is an optional relay service developed and deployed separately.
- `scripts/package-plugin.ps1` creates the installable plugin archive.

## Common checks

Run the smallest relevant command while iterating, then the broader checks before opening a pull request.

```powershell
pnpm --filter @cider-netease/plugin test
pnpm --filter @cider-netease/plugin typecheck
pnpm --filter @cider-netease/plugin build
pnpm check
```

When changing shared matching or parsing, run shared tests as well. When changing gateway code, validate the gateway independently; a gateway change must never become an implicit plugin dependency.

## Change guidelines

- Read `AGENTS.md` and follow the product rules in `DESIGN.md`.
- Keep the plugin identifier, custom-element prefix, stored preference keys, and manual-match format stable unless the change includes a migration.
- Put Cider-specific behavior behind focused adapters. Account for delayed events and state changes initiated elsewhere in Cider.
- Add regression coverage for behavior fixes. Do not remove useful tests or the preview harness to make a check pass.
- Add every user-facing string to English, Simplified Chinese, and Traditional Chinese resources.
- Write source comments and contributor documentation in English.
- For UI changes, inspect immersive and settings views at wide and narrow sizes, with keyboard navigation and reduced motion enabled.

## Packaging a plugin

`version.txt` at the repository root is the only release-version source. Change that file only; do not manually edit package or plugin manifest versions.

```powershell
pwsh -NoProfile -File ./scripts/package-plugin.ps1
```

The script synchronizes manifest versions, runs plugin checks, builds the plugin, and writes a ZIP plus checksum to `artifacts/`. The ZIP contains only the Cider plugin runtime files—never gateway source, configuration, or dependencies.

## Pull request checklist

- The change has a clear user-visible or maintenance purpose.
- Relevant tests, type checks, and builds pass.
- New UI copy is localized and product language is natural.
- Visual changes follow `DESIGN.md` and were checked at multiple sizes.
- No generated build output, credentials, cookies, gateway secrets, or local preview artifacts are committed.
- Release version files were not hand-edited; `version.txt` is used for release bumps.
