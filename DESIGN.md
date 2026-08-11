# Design Standard

NetEase Bilingual Lyrics should feel like a thoughtful Cider immersive layout, not a separate web page placed over the player. Music, artwork, and lyrics are primary; configuration and secondary information appear only when requested.

## Product principles

1. **Stay immersive.** Keep the main view calm, spacious, and readable during passive listening.
2. **Reveal controls by proximity.** Put lyric actions beside lyrics and playback actions beside playback. Avoid sending routine tasks to plugin settings.
3. **Respect Cider.** Reuse Cider state and familiar interaction patterns while giving this layout a distinct NetEase lyric experience.
4. **Avoid repetition.** A song title, album, source label, or section heading should not be repeated when its context is already clear.
5. **Degrade gracefully.** Loading, missing lyrics, unavailable translations, narrow windows, and delayed host state must still look intentional.

## Visual language

- Use NetEase red (`#E72B42` to `#FF4058`) as the main accent for selection, progress, focus, and important actions. It is an accent, not a large background fill.
- The immersive root remains transparent so Cider's selected background can show through. Use dark translucent glass, restrained blur, subtle borders, and soft shadows only where separation is needed.
- Build hierarchy with opacity and weight: high-contrast active content, readable supporting content, and quiet metadata. Never make inactive lyrics so faint that they cannot be read.
- Use Cider's effective system font stack. Keep labels compact, song titles confident, and lyric typography generous without oversized marketing-style headings.
- Base spacing on a 4 px rhythm. Prefer 8, 12, 16, 24, and 32 px gaps. Controls in one group must have consistent hit areas and visible spacing.
- Use rounded geometry consistently: compact controls around 10–14 px, panels around 20–28 px, and circular icon buttons only when the action is unambiguous.

## Immersive layout

- On wide windows, use a balanced artwork/metadata column and a flexible content column. Neither playback controls nor side groups may touch the window edge.
- Keep previous, play/pause, and next visually centered as the core transport group. Place shuffle/repeat nearby and place DSP, Spatialization, favorite, volume, and fullscreen in compact secondary groups—not at distant edges.
- Keep the right tool rail vertically centered in the usable lyric area. Reveal it smoothly when the pointer approaches; never cover the active lyric line.
- The top content switcher uses three peer destinations: Lyrics, Up Next, and History. Once selected, do not repeat the same destination as a large inner heading.
- At narrow widths, reflow intentionally into a compact layout. Do not solve collisions by shrinking controls below comfortable pointer targets or by allowing overlap.

## Lyrics and tools

- Original and translated lyric sizes are independent settings and must remain independent in rendering.
- The active original line has the strongest emphasis. Its translation is subordinate but clearly associated. Nearby lines remain visible enough to establish motion and context.
- Clicking a timed line seeks playback. Auto-follow should pause while the user browses and recover predictably.
- The tool rail may toggle original text, translation, font customization, and matching. “Custom” is an extensible settings surface, not a font-size-only action.
- Tooltips appear below playback controls when an upper tooltip would obscure the progress bar. A clicked control dismisses its tooltip immediately.
- Error states explain the problem in the current locale and offer only distinct actions: retry the same request, rematch, custom match, or use Apple Music lyrics.

## Artwork and motion

- Artwork fills its frame using a cover strategy: scale until both axes cover the frame, center the crop, and never reveal letterbox bars from malformed source canvases.
- Keep the last successfully loaded artwork visible while the next source loads. Do not flash an empty frame between songs.
- Next-track artwork moves right to left; previous-track artwork moves left to right. The transition should resemble a smooth liquid lens passing across the image, with softened edges rather than a jagged mask.
- Use motion to communicate state, generally within 180–450 ms. Artwork transitions may be longer when visually continuous, but playback controls must respond immediately.
- Sliders animate toward click and drag results without lagging behind the pointer. Favorite state uses a brief scale/fill response and always reflects confirmed host state.
- Honor `prefers-reduced-motion`: replace liquid distortion and large movement with a short crossfade.

## Settings

- Settings are for persistent preferences and connection details; frequent lyric actions also belong in immersive mode.
- Group settings by user goal, use short conversational copy, and show advanced gateway fields only when relevant.
- Use custom visual treatments for selects, menus, number steppers, sliders, toggles, and editable fields so they remain legible on glass backgrounds. Preserve keyboard behavior, focus indication, and semantic input roles.
- Support English, Simplified Chinese, and Traditional Chinese. Layouts must tolerate longer English labels without clipping.

## Accessibility and review

- Interactive targets should be at least 40 × 40 px where space permits, with visible keyboard focus and accurate `aria-label`, pressed, expanded, and value states.
- Maintain usable contrast over both light and dark Cider backgrounds; glass tint must compensate for the selected backdrop.
- Do not communicate enabled, favorite, or selected state through color alone; use icon shape/fill, labels, or accessible state as well.
- Before shipping a visual change, review: wide and narrow windows, all three locales, light and dark backgrounds, loading and error states, keyboard navigation, hover/click tooltip behavior, reduced motion, and control spacing at common Windows display scales.
