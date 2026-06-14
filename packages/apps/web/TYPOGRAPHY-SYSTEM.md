# TenorFi Typography System

All-sans type. **Mono is reserved for live / changing numbers only.** Fonts are
**self-hosted** with plain CSS `@font-face` (served from `/public/fonts`) — no
`next/font`, no build-time Google Fonts fetch, no runtime external requests.

## Font stack

| Role | Family | Weights | Where it's used |
|---|---|---|---|
| Display / headings | **Manrope** | 700 / 800 | Hero, section titles, brand wordmark, card titles |
| Body / UI | **Inter** | 400 / 500 / 600 | Paragraphs, labels, buttons, nav |
| Numbers (live/changing) | **JetBrains Mono** | 400 / 500 / 600 | Rates, balances, addresses, tx hashes, countdowns |

**Rule:** mono is for data that changes or is "machine" (rates, $ amounts, hashes),
with `font-variant-numeric: tabular-nums` so digits don't jitter. Prose and static
labels stay in Inter.

## How it's wired

### 1. Font files — `public/fonts/`
`manrope.woff2`, `inter.woff2`, `jetbrains-mono.woff2` — variable woff2 (latin
subset). Served as static assets at `/fonts/*.woff2`.

### 2. `@font-face` + tokens — `src/app/globals.css`
```css
@font-face {
  font-family: 'Manrope';
  font-weight: 400 800;   /* variable range */
  font-display: swap;
  src: url('/fonts/manrope.woff2') format('woff2');
}
/* …Inter (400 600) and JetBrains Mono (400 600) the same way… */

:root {
  --f-display: 'Manrope', ui-sans-serif, system-ui, sans-serif;
  --f-sans:    'Inter', ui-sans-serif, system-ui, -apple-system, sans-serif;
  --f-mono:    'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace;
}
```
`body` uses `var(--f-sans)`; `.display` uses `var(--f-display)`; `.mono`,
`.font-mono`, and `[data-numeric="true"]` use `var(--f-mono)` with tabular-nums.

### 3. Tailwind — `tailwind.config.ts`
```ts
fontFamily: {
  sans:    ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
  display: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
  mono:    ["JetBrains Mono", "ui-monospace", "SF Mono", "monospace"],
}
```

### 4. `src/app/layout.tsx`
No font imports. `<body className="antialiased">` — the cascade does the rest.

## Key type details

- **Display** tracking is tight: `letter-spacing: -0.035em`, `line-height: 1.02`, weight 800.
- **Eyebrows:** Inter 600, 11–12px, `text-transform: uppercase`, `letter-spacing: 0.18em`.
- **Mono numbers:** `font-variant-numeric: tabular-nums`, and a slight `-0.01em` to
  `-0.04em` tracking on large figures.

## Why self-hosted (not `next/font/google`)

`next/font/google` downloads fonts from Google **at build time**. In a restricted /
offline environment that fetch fails, the font CSS variables come back empty, and
headings fall back to the browser's default **serif (Times)**. Plain `@font-face`
over local files has zero build-time network dependency and always renders.

To refresh the woff2 files, download the latin variable subset from the Google Fonts
`css2` API into `public/fonts/` (needs network once).

---

Built for ETHGlobal New York 2026 · self-hosted, offline-safe typography
