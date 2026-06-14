# TenorFi Web App

Next.js web application for TenorFi — On-chain fixed-funding-rate swaps.

## Overview

This web app provides:
- **Landing Page** (`/`) — product tutorial, problem explanation, and setup instructions
- **Explorer** (`/explorer`) — Browse all funding-rate swaps
- **Swap Details** (`/explorer/[swapId]`) — Detailed view of individual swaps

## Getting Started

### Prerequisites

- Node.js 18+ and pnpm

### Installation

From the **root of the monorepo** (`tenorfi/`):

```bash
pnpm install
```

### Development

```bash
cd apps/web
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### Build for Production

```bash
pnpm build
pnpm start
```

## Logo Placement

**⚠️ IMPORTANT:** Place your TenorFi logo files in `public/` before deploying:

See [`public/LOGO-PLACEMENT.md`](./public/LOGO-PLACEMENT.md) for detailed instructions.

### Quick Checklist:
- [ ] Add `public/tenorfi-logo.svg` (main logo, 256x256px+ or SVG)
- [ ] Add `public/favicon.ico` (32x32px)
- [ ] Add `public/icon.svg` (for modern browsers)
- [ ] Add `public/og-image.png` (1200x630px for social sharing)

The placeholder logo (`public/tenorfi-logo.svg`) will work, but **replace it with your actual brand logo**.

## Pages

### 1. Landing Page (`/`)

Inspired by CoinGecko landing page structure:
- **Hero** — Value proposition + stats
- **Problem Section** — Ethena story ($8B bleed)
- **Get Started** — Setup and connection instructions
- **Example Prompts** — Natural language queries you can ask
- **How It Works** — 3-step flow
- **Feature Grid** — 6 capability cards
- **Architecture Diagram** — Tech stack visualization
- **FAQ** — Accordion with common questions

### 2. Explorer (`/explorer`)

Browse all swaps:
- **Stats Bar** — Global stats (active swaps, total notional, etc.)
- **Funding Rate Chart** — Live 24h AFR chart
- **Swaps Table** — Filterable table (All / Active / Closed)

### 3. Swap Details (`/explorer/[swapId]`)

Individual swap view:
- **Swap Header** — Parties, notional, fixed rate
- **Collateral Health** — Progress bars for hedger/LP collateral
- **AFR vs FFR Chart** — Visual comparison over time
- **Settlement History** — Table of all settled periods
- **Swap Metadata** — Cap, total PnL, next settlement countdown

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Styling:** Tailwind CSS
- **Language:** TypeScript
- **Web3 (future):** viem for contract reads

## Current State

- ✅ Static pages with mock data
- ✅ All components built and styled
- ⏳ **Backend integration pending** (viem + contract ABIs)

## Mock Data

All data is currently mocked in `src/lib/tenorfi-data.ts`:
- Swaps
- Settlements
- Funding rate history
- LP offers
- Global stats

**Next step:** Replace mock data with real contract reads when backend is ready.

## Project Structure

```
apps/web/
├── public/
│   ├── tenorfi-logo.svg         # ⚠️ Replace with actual logo
│   ├── favicon.ico           # ⚠️ Add your favicon
│   └── LOGO-PLACEMENT.md     # Logo placement guide
├── src/
│   ├── app/
│   │   ├── page.tsx          # Landing page
│   │   ├── explorer/
│   │   │   ├── page.tsx      # Explorer (swaps table)
│   │   │   └── [swapId]/
│   │   │       └── page.tsx  # Swap details
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── landing/          # Landing page sections
│   │   ├── explorer/         # Explorer components
│   │   └── shared/           # Header, Footer, CodeBlock
│   ├── lib/
│   │   ├── tenorfi-data.ts   # Mock data (replace later)
│   │   └── utils.ts          # Helper functions
│   └── types/
│       └── swap.ts           # TypeScript types
├── package.json
├── tsconfig.json
├── tailwind.config.ts
└── next.config.js
```

## Design Tokens (Tailwind)

```ts
tenorfi: {
  primary: '#3B82F6',     // Blue (locked/certainty)
  floating: '#F59E0B',    // Orange (variable/risk)
  success: '#10B981',     // Green (active)
  danger: '#EF4444',      // Red (closed/alert)
  neutral: '#6B7280',
}
```

## Deployment

### Vercel (Recommended)

1. Connect your GitHub repo to Vercel
2. Set root directory to `apps/web`
3. Deploy

### Manual

```bash
pnpm build
```

Upload the `.next` build folder to your hosting provider.

## Next Steps

1. **Add your logo** (see `public/LOGO-PLACEMENT.md`)
2. **Wire real data** with viem + contract ABIs from `packages/contracts/deployments.json`
3. **Connect wallet** (wagmi) for user-specific views
4. Deploy to Vercel

---

Built for ETHGlobal New York 2026 · MIT License
