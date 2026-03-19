# Milestone: Seasonal Theme

**Status**: done

## Summary

Replace the generic dark theme with a seasonal palette system inspired by Cuyahoga Valley National Park. Each season maps to a complete set of CSS design tokens — spring ships first, with summer/fall/winter as future sessions. The site's visual identity becomes tied to place and time rather than "default LLM chat app."

Light mode for spring (morning fog on the towpath). Typography split: proportional font for blog/prose, monospace for chat/observability infrastructure. Theme scoped via `data-season` attribute on `<html>` so seasonal swaps are pure CSS — no component changes.

## Design Direction

**Spring (late March – May):**
- Inspired by early spring in the valley: dappled light through bare/budding canopy, wildflowers on the forest floor, moss on sandstone ledges, misty mornings on the river, Brandywine Falls at peak snowmelt flow
- Warm off-white/cream backgrounds (fog), sandstone surface tones, deep bark/soil text
- Accent: Virginia bluebell (pink-turning-blue), moss green secondary
- Success: chartreuse new-leaf green. Error: red maple flower. Warning: dogwood cream-gold
- Blog typography: readable serif or editorial sans — like interpretive trail signage
- Chat/observability: monospace stays — the infrastructure under the forest floor

**Future seasons (not this milestone):**
- Summer: full canopy, deep greens, humid warmth, cicada energy
- Fall: copper, rust, amber, gold — the classic CVNP palette
- Winter: bare branches, snow on stone, fog in the valley, quiet

## Architecture

```
html[data-season="spring"] {
  --color-bg: ...;
  --color-bg-surface: ...;
  /* full token set */
}

html[data-season="fall"] {
  /* same tokens, different values */
}
```

Components reference tokens via Tailwind (`bg-bg`, `text-text`, etc.) — already the case. Season swap = CSS-only. No component code changes for future seasons.

## Verification Gate

- [x] Theme infrastructure: `data-season` attribute, CSS token scoping, season detection or picker
- [x] Spring palette: all color tokens defined, applied to every surface
- [x] Typography split: proportional font on blog/prose, mono on chat/observability
- [ ] Light mode contrast: all text passes WCAG AA (4.5:1) against backgrounds — needs visual verification
- [x] Blog prose restyled with new typography + warm palette
- [x] Existing component tests pass with new theme (no visual regressions in logic)
- [x] Build passes, types clean

## Stories

| Story | Persona | Summary |
|-------|---------|---------|
| [spring-theme](stories/spring-theme.md) | Tyler (site owner) | Build theme infrastructure + spring CVNP palette + typography split |
