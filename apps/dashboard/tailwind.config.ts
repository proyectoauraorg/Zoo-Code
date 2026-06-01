import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    // Tremor module
    "./node_modules/@tremor/**/*.{js,ts,jsx,tsx}",
  ],
  safelist: [
    {
      // Clases de color dinámicas de Tremor (charts/badges/progress).
      pattern:
        /^(bg|text|border|ring|stroke|fill)-(emerald|red|amber|blue|gray|slate|green|rose|yellow|orange|indigo|teal|violet)-(50|100|200|300|400|500|600|700|800|900)$/,
      variants: ["hover", "ui-selected"],
    },
    {
      pattern:
        /^(bg|border|ring|fill)-(emerald|red|amber|blue|gray|slate|green|rose|yellow|orange|indigo|teal|violet)-(50|100|200|300|400|500|600|700|800|900)\/\d+$/,
    },
  ],
  theme: {
    transparent: "transparent",
    current: "currentColor",
    extend: {
      colors: {
        // Tokens semánticos ZooDash (referencian CSS vars de globals.css).
        canvas: "var(--color-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          elevated: "var(--color-surface-elevated)",
          muted: "var(--color-surface-muted)",
        },
        line: "var(--color-border)",
        fg: {
          DEFAULT: "var(--color-text)",
          muted: "var(--color-text-muted)",
          subtle: "var(--color-text-subtle)",
        },
        brand: {
          DEFAULT: "var(--color-primary)",
          fg: "var(--color-primary-fg)",
        },
        success: { DEFAULT: "var(--color-success)", bg: "var(--color-success-bg)" },
        merged: { DEFAULT: "var(--color-merged)", bg: "var(--color-merged-bg)" },
        warning: { DEFAULT: "var(--color-warning)", bg: "var(--color-warning-bg)" },
        danger: { DEFAULT: "var(--color-danger)", bg: "var(--color-danger-bg)" },
        info: { DEFAULT: "var(--color-info)", bg: "var(--color-info-bg)" },
        draft: { DEFAULT: "var(--color-draft)", bg: "var(--color-draft-bg)" },

        // --- Tremor (se mantiene; alineado a la paleta) ---
        tremor: {
          brand: {
            faint: "#eff6ff",
            muted: "#bfdbfe",
            subtle: "#60a5fa",
            DEFAULT: "#3b82f6",
            emphasis: "#1d4ed8",
            inverted: "#ffffff",
          },
          background: {
            muted: "#f9fafb",
            subtle: "#f3f4f6",
            DEFAULT: "#ffffff",
            emphasis: "#374151",
          },
          border: { DEFAULT: "#e5e7eb" },
          ring: { DEFAULT: "#e5e7eb" },
          content: {
            subtle: "#9ca3af",
            DEFAULT: "#6b7280",
            emphasis: "#374151",
            strong: "#111827",
            inverted: "#ffffff",
          },
        },
        "dark-tremor": {
          brand: {
            faint: "#0B1229",
            muted: "#172554",
            subtle: "#1e40af",
            DEFAULT: "#3b82f6",
            emphasis: "#60a5fa",
            inverted: "#030712",
          },
          background: {
            muted: "#0e1626",
            subtle: "#172033",
            DEFAULT: "#111827",
            emphasis: "#d1d5db",
          },
          border: { DEFAULT: "#243041" },
          ring: { DEFAULT: "#243041" },
          content: {
            subtle: "#4b5563",
            DEFAULT: "#9ca3af",
            emphasis: "#e5e7eb",
            strong: "#f9fafb",
            inverted: "#000000",
          },
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        "tremor-small": "0.375rem",
        "tremor-default": "0.5rem",
        "tremor-full": "9999px",
      },
      transitionDuration: {
        fast: "120ms",
        base: "180ms",
      },
      transitionTimingFunction: {
        standard: "cubic-bezier(0.2, 0, 0, 1)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 180ms cubic-bezier(0.2, 0, 0, 1) both",
      },
      boxShadow: {
        card: "var(--shadow-card)",
        popover: "var(--shadow-popover)",
        "tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "tremor-card":
          "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "tremor-dropdown":
          "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
        "dark-tremor-input": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
        "dark-tremor-card":
          "0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)",
        "dark-tremor-dropdown":
          "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)",
      },
      fontSize: {
        "tremor-label": ["0.75rem", { lineHeight: "1rem" }],
        "tremor-default": ["0.875rem", { lineHeight: "1.25rem" }],
        "tremor-title": ["1.125rem", { lineHeight: "1.75rem" }],
        "tremor-metric": ["1.875rem", { lineHeight: "2.25rem" }],
      },
    },
  },
  plugins: [require("@headlessui/tailwindcss"), require("@tailwindcss/forms")],
};

export default config;
