# Logo Placement Guide

## Current Logo Files

### ✅ Installed Logo Files

1. **Main Logo (SVG)** - `keel-logo.svg` ✅
   - Blue heartbeat/waveform with padlock icon
   - Transparent background
   - Scalable vector format
   - Used in: Header, Footer

2. **Main Logo (PNG)** - `keel_logo.png` ✅
   - Blue color with transparent background
   - Fallback format

### 🔴 Missing Files (Recommended)

#### Favicon Files
- **File:** `favicon.ico`
  - Size: 32x32px
  - Format: ICO
  - Usage: Browser tab icon

- **File:** `icon.svg`
  - Size: SVG (scalable)
  - Usage: Modern browsers (Next.js App Router convention)
  - **Suggestion:** Use `keel-logo.svg` as base

- **File:** `apple-icon.png` (Optional)
  - Size: 180x180px
  - Usage: iOS home screen icon

#### Open Graph Image
- **File:** `og-image.png`
- **Size:** 1200x630px
- **Usage:** Social media sharing (Twitter, LinkedIn, Discord, etc.)
- **Content:** Should include Keel logo + tagline "Lock Your Funding Rate"

## Where Logos Are Used

### Header (`/src/components/shared/Header.tsx`)
```tsx
<motion.div whileHover={{ scale: 1.05 }}>
  <Image
    src="/keel-logo.svg"  // ✅ Blue Keel logo
    alt="Keel"
    width={32}
    height={32}
    className="w-8 h-8"
  />
</motion.div>
```

### Footer (`/src/components/shared/Footer.tsx`)
```tsx
<motion.div whileHover={{ scale: 1.05 }}>
  <Image
    src="/keel-logo.svg"  // ✅ Blue Keel logo
    alt="Keel"
    width={28}
    height={28}
    className="w-7 h-7"
  />
</motion.div>
```

### Metadata (`/src/app/layout.tsx`)
```tsx
openGraph: {
  images: ["/og-image.png"],  // 🔴 Needs creation
}
```

## Quick Setup Checklist

- [x] ✅ Add `keel-logo.svg` to `/public/`
- [x] ✅ Add `keel_logo.png` to `/public/`
- [ ] 🔴 Add `favicon.ico` to `/public/` (optional - for old browsers)
- [x] ✅ Add `icon.svg` to `/public/` (auto-generated from logo)
- [ ] 🔴 Replace placeholder SVG with actual blue Keel logo
- [ ] 🔴 Add `og-image.png` to `/public/` (1200x630px)
- [ ] 🔴 (Optional) Add `apple-icon.png` to `/public/` (180x180px)

## Logo Details

**Blue Keel Logo:**
- Design: Heartbeat/waveform + padlock icon
- Color: Blue (#3b82f6 primary blue)
- Background: Transparent
- Format: SVG (vector) + PNG (raster fallback)
- Represents: Platform stability monitoring + security

## Notes

- ✅ Logo works perfectly on dark maritime background
- ✅ SVG provides crisp display at all sizes
- ✅ Logo includes hover animation (scale on hover)
- 🔴 Create favicon using the Keel logo icon
- 🔴 Create OG image: Blue Keel logo + "Lock Your Funding Rate" tagline + maritime background
