import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // ---- Light "paper + navy + clay" system ----
        paper: { DEFAULT: "#F4F1EA", 2: "#EDE8DC", 3: "#E4DECF" },
        bone: "#FAF7F0",
        raised: "#FFFFFF",
        sand: "#C9C0A8",
        ink: { DEFAULT: "#14171C", 2: "#3A3F49", 3: "#6A7180", 4: "#9BA1AD" },
        line: { DEFAULT: "#DED8C9", 2: "#CBC4B2" },
        navy: {
          DEFAULT: "#1A2E4C",
          900: "#0E1A2E",
          800: "#14223A",
          600: "#2B4A78",
          400: "#5E7BA6",
          tint: "#D9E1EE",
          tint2: "#EBEFF6",
        },
        clay: { DEFAULT: "#C0823A", 600: "#A66E2C", tint: "#F0E6D2", tint2: "#F6EFE0" },
        up: { DEFAULT: "#2C8B79", tint: "#DCEBE6" },
        down: { DEFAULT: "#B0463A", tint: "#F1DCD8" },

        // ---- Back-compat: legacy tenorfi-* names mapped to the light palette ----
        tenorfi: {
          ink: { 950: "#F4F1EA", 900: "#EDE8DC", 800: "#FAF7F0", 700: "#FFFFFF" },
          primary: "#1A2E4C", // navy
          floating: "#C0823A", // clay
          success: "#2C8B79",
          danger: "#B0463A",
          neutral: "#6A7180",
          heat: "#C0823A",
          cool: "#2B4A78",
        },
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SF Mono", "monospace"],
      },
      boxShadow: {
        "tenorfi-sm": "0 1px 2px rgba(20,23,28,0.05), 0 1px 1px rgba(20,23,28,0.03)",
        "tenorfi-md": "0 6px 16px -4px rgba(20,23,28,0.08), 0 2px 6px -2px rgba(20,23,28,0.05)",
        "tenorfi-lg": "0 16px 36px -10px rgba(20,23,28,0.14), 0 6px 14px -6px rgba(20,23,28,0.07)",
      },
      borderRadius: {
        xl2: "28px",
      },
    },
  },
  plugins: [],
};
export default config;
