export default {
  darkMode: 'class',
  content: ["./src/**/*.{js,jsx,ts,tsx}", "./index.html"],
  theme: {
    extend: {
      fontFamily: {
        outfit: ["Outfit", "sans-serif"],
        display: ['"Fraunces"', "Georgia", "serif"],
      },
      colors: {
        // Warm palette driven by CSS variables in src/index.css.
        // Scale flips in dark mode so existing bg-orange-50 / text-orange-900
        // classes automatically re-theme.
        orange: {
          50: "rgb(var(--c-orange-50) / <alpha-value>)",
          100: "rgb(var(--c-orange-100) / <alpha-value>)",
          200: "rgb(var(--c-orange-200) / <alpha-value>)",
          300: "rgb(var(--c-orange-300) / <alpha-value>)",
          400: "rgb(var(--c-orange-400) / <alpha-value>)",
          500: "rgb(var(--c-orange-500) / <alpha-value>)",
          600: "rgb(var(--c-orange-600) / <alpha-value>)",
          700: "rgb(var(--c-orange-700) / <alpha-value>)",
          800: "rgb(var(--c-orange-800) / <alpha-value>)",
          900: "rgb(var(--c-orange-900) / <alpha-value>)",
        },
        amber: {
          50: "rgb(var(--c-amber-50) / <alpha-value>)",
          100: "rgb(var(--c-amber-100) / <alpha-value>)",
        },
        sage: {
          100: "rgb(var(--c-sage-100) / <alpha-value>)",
          400: "rgb(var(--c-sage-400) / <alpha-value>)",
          500: "rgb(var(--c-sage-500) / <alpha-value>)",
          600: "rgb(var(--c-sage-600) / <alpha-value>)",
        },
      },
      keyframes: {
        'slide-up': {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
      animation: {
        'slide-up': 'slide-up 0.3s ease-out',
        'fade-in': 'fade-in 0.4s ease-out',
      },
      boxShadow: {
        warm: '0 1px 3px 0 rgb(120 70 30 / 0.06), 0 1px 2px -1px rgb(120 70 30 / 0.04)',
        'warm-lg': '0 10px 30px -10px rgb(120 70 30 / 0.15)',
      },
    },
  },
  plugins: [],
};
