import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: "var(--bg-primary)",
          secondary: "var(--bg-secondary)",
          card: "var(--bg-card)",
          hover: "var(--bg-hover)",
        },
        border: {
          DEFAULT: "var(--border)",
          light: "var(--border-light)",
        },
        primary: {
          DEFAULT: "#22E8DC",
          hover: "#1ACFC4",
          muted: "#22E8DC33",
        },
        accent: {
          purple: "#7C3AED",
          amber: "#F59E0B",
          red: "#EF4444",
          blue: "#3B82F6",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        discord: {
          bg: "#36393F",
          card: "#2F3136",
          embed: "#2B2D31",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      animation: {
        "fade-in": "fadeIn 0.3s ease-out",
        "slide-up": "slideUp 0.3s ease-out",
        "slide-in": "slideIn 0.3s ease-out",
        "pulse-green": "pulseGreen 2s infinite",
      },
      keyframes: {
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideUp: {
          "0%": { opacity: "0", transform: "translateY(10px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        slideIn: {
          "0%": { opacity: "0", transform: "translateX(-10px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        pulseCyan: {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(34, 232, 220, 0.4)" },
          "50%": { boxShadow: "0 0 0 8px rgba(34, 232, 220, 0)" },
        },
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "grid-pattern":
          "linear-gradient(rgba(34, 212, 94, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 212, 94, 0.03) 1px, transparent 1px)",
      },
      backgroundSize: {
        "grid-pattern": "32px 32px",
      },
    },
  },
  plugins: [],
};

export default config;
