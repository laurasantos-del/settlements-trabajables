import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "#0f0f0f",
        card: "#141414",
        border: "#1f1f1f",
        muted: "#666666",
        accent: "#f97316"
      },
      borderRadius: {
        xl: "12px"
      }
    }
  },
  plugins: [require("tailwindcss-animate")]
};

export default config;
