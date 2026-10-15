/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        forest: { 950: "#04120D", 900: "#071C16", 850: "#09241C", 800: "#0B2B20", 700: "#11402F", 600: "#1A5640" },
        neon: { DEFAULT: "#39F27A", soft: "#7CF7A6", dim: "#22B65A" },
        cyan: { accent: "#43D9D0" },
        ink: { DEFAULT: "#F3F8F4", muted: "#A9BDB0", faint: "#6F8A7A" },
        warn: "#F5C451",
        danger: "#FF6B6B",
        info: "#5AB8FF",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "Segoe UI", "Roboto", "sans-serif"],
        display: ["'Space Grotesk'", "Inter", "system-ui", "sans-serif"],
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(57,242,122,.35), 0 0 24px -4px rgba(57,242,122,.35)",
        panel: "0 18px 48px -24px rgba(0,0,0,.65)",
      },
      borderRadius: { xl2: "14px" },
      keyframes: {
        "fade-up": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "none" } },
        "pop-in": { from: { opacity: 0, transform: "scale(.92) translateY(12px)" }, to: { opacity: 1, transform: "none" } },
        "scroll-dot": { "0%": { transform: "translateY(0)", opacity: 1 }, "80%": { transform: "translateY(12px)", opacity: 0 }, "100%": { opacity: 0 } },
      },
      animation: {
        "fade-up": "fade-up .35s ease-out both",
        "pop-in": "pop-in .22s cubic-bezier(.2,.9,.3,1.2) both",
        "scroll-dot": "scroll-dot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
