/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        oasis: {
          bg: "#dfe4ea",
          panel: "#eef1f5",
          header: "#1f3a5f",
          accent: "#3b6ea5",
          border: "#9aa7b5",
        },
      },
    },
  },
  plugins: [],
};
