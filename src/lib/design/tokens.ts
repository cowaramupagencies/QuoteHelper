/** Design tokens — reference for TS/components; Tailwind mirrors these in tailwind.config.ts */
export const tokens = {
  color: {
    page: "#F3F6F5",
    surface: "#FFFFFF",
    ink: "#22272B",
    inkSecondary: "#626B73",
    border: "#E2E7E5",
    brand: "#00866A",
    brandDark: "#006B55",
    brandLight: "#E6F4EF",
    brandSoft: "#F0F8F5",
  },
  radius: {
    md: "0.75rem",
    lg: "1rem",
    xl: "1.25rem",
    "2xl": "1.5rem",
  },
} as const;
