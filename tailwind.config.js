/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Paleta TradeMiles (contraste alto)
        primary: "#0F3D5C",            // azul mais escuro (melhor contraste)
        primaryForeground: "#FFFFFF",
        secondary: "#2563EB",          // azul vívido (hover/realce)
        secondaryForeground: "#FFFFFF",
        accent: "#F59E0B",
        accentForeground: "#0B0B0B",

        // Neutros / superfícies
        surface: "#FFFFFF",
        muted: "#F1F5F9",
        border: "#E2E8F0",
      },
      boxShadow: { soft: "0 4px 20px rgba(0,0,0,0.06)" },
      borderRadius: { xl: "0.75rem", "2xl": "1rem" },
    },
  },
  plugins: [],
};
