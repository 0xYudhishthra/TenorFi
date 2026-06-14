# Logo Placement Guide

## Current Logo Files

### ✅ Installed Logo Files

1. **Main Logo (SVG)** - `tenorfi-logo.svg` ✅
   - Blue heartbeat/waveform with padlock icon
   - Transparent background
   - Scalable vector format
   - Used in: Header, Footer

2. **Main Logo (PNG)** - `tenorfi_logo.png` ✅
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
  - **Suggestion:** Use `tenorfi-logo.svg` as base

- **File:** `apple-icon.png` (Optional)
  - Size: 180x180px
  - Usage: iOS home screen icon

#### Open Graph Image
- **File:** `og-image.png`
- **Size:** 1200x630px
- **Usage:** Social media sharing (Twitter, LinkedIn, Discord, etc.)
- **Content:** Should include TenorFi logo + tagline "Lock Your Funding Rate"

## Where Logos Are Used

### Header (`/src/components/shared/Header.tsx`)
```tsx
<motion.div whileHover={{ scale: 1.05 }}>
  <Image
    src="/tenorfi-logo.svg"  // ✅ Blue TenorFi logo
    alt="TenorFi"
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
    src="/tenorfi-logo.svg"  // ✅ Blue TenorFi logo
    alt="TenorFi"
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

- [x] ✅ Add `tenorfi-logo.svg` to `/public/`
- [x] ✅ Add `tenorfi_logo.png` to `/public/`
- [ ] 🔴 Add `favicon.ico` to `/public/` (optional - for old browsers)
- [x] ✅ Add `icon.svg` to `/public/` (auto-generated from logo)
- [ ] 🔴 Replace placeholder SVG with actual blue TenorFi logo
- [ ] 🔴 Add `og-image.png` to `/public/` (1200x630px)
- [ ] 🔴 (Optional) Add `apple-icon.png` to `/public/` (180x180px)

## Logo Details

**Blue TenorFi Logo:**
- Design: Heartbeat/waveform + padlock icon
- Color: Blue (#3b82f6 primary blue)
- Background: Transparent
- Format: SVG (vector) + PNG (raster fallback)
- Represents: Platform stability monitoring + security

## Notes

- ✅ Logo works perfectly on dark maritime background
- ✅ SVG provides crisp display at all sizes
- ✅ Logo includes hover animation (scale on hover)
- 🔴 Create favicon using the TenorFi logo icon
- 🔴 Create OG image: Blue TenorFi logo + "Lock Your Funding Rate" tagline + maritime background
