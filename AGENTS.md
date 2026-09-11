# Agent Guide

This repository contains a plugin for Cider 3.1 and later (including Cider 4), shared NetEase lyric logic, and an optional gateway. Work from observed Cider behavior and the current codebase; do not invent host APIs or assume that every supported host version exposes identical internals.

## Repository map

- `plugin/`: the installable Cider plugin, immersive layout, settings UI, adapters, and tests.
- `packages/shared/`: transport-independent matching, lyric parsing, and shared contracts.
- `gateway/`: an optional relay service. It is not part of the plugin release archive.
- `scripts/`: repository-level packaging and maintenance tools.
- `version.txt`: the only source of truth for release versions.

## Working method

1. Read this file, `DESIGN.md`, and the affected callers before editing.
2. Reproduce or characterize the current behavior. For host integration issues, compare with a current built-in Cider immersive layout when possible.
3. Make the smallest coherent change. Preserve plugin identity, stored settings, manual mappings, and public contracts unless a migration is included.
4. Add or update a regression test for behavior changes. Keep the browser preview useful for interaction and visual QA.
5. Run focused checks first, then the complete relevant check set. Report known baseline failures separately from regressions.
6. For visual changes, inspect both the immersive player and settings preview at wide and narrow sizes, in more than one locale.
7. When testing Cider integration or immersive UI behavior, launch the local Cider build with CDP debugging enabled and verify the result through its CDP page target.

## Cider integration rules

- Treat Cider as the owner of playback, queue, history, favorites, volume, DSP, Spatialization, and immersive background state. Use the supported PluginKit surface or a small defensive adapter.
- Preserve compatibility with Cider 3.1 and later, including Cider 4. Test guarded fallbacks whenever host APIs differ between major versions.
- Host state may arrive late or change outside the plugin. Subscribe when possible, reconcile after actions, and provide safe fallbacks instead of permanently optimistic UI.
- Plugin setup and teardown must be idempotent. Disconnect observers, event listeners, timers, and custom elements cleanly.
- Keep the `dev.masterain.cider-netease-lyrics` identifier and the `cnl` custom-element prefix stable.
- Do not require NetEase credentials, cookies, or account access. Direct mode remains the default; the custom gateway is optional.
- Keep gateway-specific code behind the transport boundary. Never include gateway source, configuration, secrets, or dependencies in a plugin ZIP.

## Product and code standards

- Follow `DESIGN.md`; retain Cider-native behavior, NetEase red as an accent, transparent glass surfaces, and a content-first hierarchy.
- Every user-facing string must use the localization system. Maintain English, Simplified Chinese, and Traditional Chinese entries together.
- Use semantic controls, keyboard focus, useful accessible names, and reduced-motion fallbacks. Do not rely on color alone for state.
- Prefer custom-styled selects, sliders, steppers, menus, and tooltips over mismatched browser chrome, while preserving native accessibility semantics.
- Source code, comments, commit messages, and contributor documentation are English. Comments should explain intent or host quirks, not restate code.
- Keep TypeScript strict. Avoid global state, broad DOM selectors, and untyped host objects outside adapter boundaries.
- Do not delete a test merely because it fails after a change. Determine whether the product behavior or the test expectation is stale.

## Validation and release

Use the commands documented in `CONTRIBUTING.md`. At minimum, behavior changes require plugin tests and type checking; shared or gateway changes require their own checks too.

Humans change only `version.txt` for a release version. Run `scripts/package-plugin.ps1`; it synchronizes manifests, validates and builds the plugin, and creates an artifact containing only `plugin.js`, `plugin.yml`, and `icon.png`. Never hand-edit generated release versions or commit build output.

Hand off with a concise summary of user-visible changes, checks run, limitations, and the exact artifact path when packaging was requested.
