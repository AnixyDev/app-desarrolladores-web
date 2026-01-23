/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./*.{js,ts,jsx,tsx}",
    "./pages/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./hooks/**/*.{js,ts,jsx,tsx}",
    "./services/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: {
          50: '#fdf2f9',
          100: '#fce7f5',
          200: '#f9cfeb',
          300: '#f5a9d8',
          400: '#ef74bd',
          500: '#d9009f', 
          600: '#c20084',
          700: '#a10068',
          800: '#850255',
          900: '#70074a',
          950: '#440129',
        },
        gray: {
          950: '#030712',
          900: '#111827',
          800: '#1f2937',
          700: '#374151',
        }
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
      },
    },
  },
  plugins: [],
}