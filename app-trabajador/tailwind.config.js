/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // FENIC Integral brand
        brand: {
          50: "#fef6e0",
          100: "#fdecc4",
          300: "#fcd36b",
          400: "#facb3f",
          500: "#f9b414", // primary amber ("hard-hat yellow")
          600: "#d99a0f",
          700: "#a8770c",
          900: "#6b4d09",
        },
        ink: {
          700: "#3f454b",
          800: "#32373c", // charcoal
          900: "#23272b",
        },
      },
    },
  },
  plugins: [],
};
