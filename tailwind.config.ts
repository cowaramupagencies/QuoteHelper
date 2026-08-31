import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        page: "#F3F6F5",
        surface: "#FFFFFF",
        ink: {
          DEFAULT: "#22272B",
          secondary: "#626B73",
        },
        border: {
          DEFAULT: "#E2E7E5",
          strong: "#CDD4D0",
        },
        brand: {
          DEFAULT: "#00866A",
          dark: "#006B55",
          light: "#E6F4EF",
          soft: "#F0F8F5",
          hover: "#007A60",
        },
        muted: "#626B73",
        card: "#FFFFFF",
      },
      fontFamily: {
        sans: ["var(--font-dm-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        lg: "0.75rem",
        xl: "1rem",
        "2xl": "1.25rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        card: "0 1px 2px rgba(34, 39, 43, 0.04), 0 4px 16px rgba(34, 39, 43, 0.06)",
        "card-hover": "0 2px 4px rgba(34, 39, 43, 0.06), 0 8px 24px rgba(34, 39, 43, 0.08)",
      },
      maxWidth: {
        app: "72rem",
      },
    },
  },
  plugins: [],
};

export default config;
