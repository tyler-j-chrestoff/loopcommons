# Story: Spring Theme

> As **Tyler (site owner)**, I want Loop Commons to feel like early spring in Cuyahoga Valley National Park — warm light filtering through bare canopy, wildflowers on the forest floor, moss on sandstone — so that the site has a visual identity rooted in place rather than generic dark-mode defaults.

## Acceptance Criteria

- Theme infrastructure supports multiple seasons via `data-season` attribute on `<html>`
- Spring palette applied: warm light backgrounds, sandstone surfaces, bark/soil text, bluebell accent
- Typography split: proportional font for blog prose, monospace for chat and observability panels
- All text meets WCAG AA contrast ratios (4.5:1 normal, 3:1 large)
- Blog `.blog-prose` restyled with new font and spring colors
- Existing tests pass — theme is cosmetic, no logic changes
- Architecture ready for future seasons (summer/fall/winter) as CSS-only additions

## Tasks

```jsonl
{"id":"theme-01","story":"spring-theme","description":"Research task: select a proportional font for blog/prose. Requirements: (1) available via next/font or Google Fonts, (2) good readability at body sizes, (3) pairs well with JetBrains Mono, (4) has character — not generic (think trail signage, field guides, national park interpretive materials). Evaluate 3-5 candidates, pick one. Also research light-mode Shiki theme for code blocks to replace github-dark-dimmed.","depends_on":[],"requires":"","status":"done"}
{"id":"theme-02","story":"spring-theme","description":"Build theme infrastructure in globals.css. Refactor existing color tokens from @theme into html[data-season='spring'] scope. Add a default/fallback season. Ensure Tailwind v4 utility classes (bg-bg, text-text, etc.) continue to resolve correctly through the CSS custom properties. The existing dark theme values become a reference but are replaced by spring palette.","depends_on":["theme-01"],"requires":"","status":"done"}
{"id":"theme-03","story":"spring-theme","description":"Define the spring CVNP color palette. All tokens: bg, bg-surface, bg-elevated, bg-hover, border, border-subtle, text, text-secondary, text-muted, accent, accent-hover, user-bubble, assistant-bubble, success, error, warning. Inspired by: morning fog (backgrounds), sandstone ledges (surfaces), bark/soil (text), Virginia bluebell pink-to-blue (accent), moss green (secondary), new-leaf chartreuse (success), red maple flower (error), dogwood cream-gold (warning). Test every token against at least one real component visually.","depends_on":["theme-02"],"requires":"","status":"done"}
{"id":"theme-04","story":"spring-theme","description":"Implement typography split. Add the chosen proportional font via next/font in layout.tsx. Apply it to blog layout and .blog-prose. Keep JetBrains Mono on chat, observability panels, and code blocks. Ensure font-mono Tailwind class still works for monospace contexts. Update .blog-prose CSS for the new font (line-height, heading sizes, paragraph spacing may need adjustment for proportional type).","depends_on":["theme-01","theme-03"],"requires":"","status":"done"}
{"id":"theme-05","story":"spring-theme","description":"Update .blog-prose styling for spring theme. Restyle headings, links, blockquotes, code blocks, tables for the warm light palette. Switch Shiki code block theme to the light theme chosen in theme-01. Ensure code blocks are readable against the light background. Update link colors (accent), blockquote styling (border + background), table borders.","depends_on":["theme-03","theme-04"],"requires":"","status":"done"}
{"id":"theme-06","story":"spring-theme","description":"Light-mode component audit. Review all existing components in the light spring theme for contrast issues, readability, and visual coherence. Key areas: chat bubbles (user vs assistant differentiation), observability sidebar (threat gauges, score bars, badge colors), context budget bar (threshold colors), login page, header/nav. Fix any contrast failures (WCAG AA: 4.5:1 normal text, 3:1 large text). Add subtle shadows where border-only elevation no longer provides sufficient contrast in light mode.","depends_on":["theme-03"],"requires":"","status":"done"}
{"id":"theme-07","story":"spring-theme","description":"Season selection mechanism. Add data-season attribute to <html> in layout.tsx. For now, default to 'spring'. Add a minimal season picker (small icon in header or footer) that sets the attribute and persists to localStorage. Only spring is functional — other seasons show a tooltip 'Coming soon'. Wire the attribute so future seasons only need a new CSS block in globals.css.","depends_on":["theme-06"],"requires":"","status":"done"}
{"id":"theme-08","story":"spring-theme","description":"Verification: run full test suite (packages/web and packages/llm), verify build passes (next build), verify types clean. Visual spot-check: blog listing, blog post, chat page, login page. No new tests needed — theme is purely cosmetic. Fix any test failures caused by the theme changes (e.g., snapshot tests, hardcoded color assertions).","depends_on":["theme-05","theme-06","theme-07"],"requires":"","status":"done"}
```
