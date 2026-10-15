/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        'void-bg': 'rgb(var(--void-bg) / <alpha-value>)',
        'ghost-glow': 'rgb(var(--ghost-glow) / <alpha-value>)',
        'scam-glow': 'rgb(var(--scam-glow) / <alpha-value>)',
        'verified-glow': 'rgb(var(--verified-glow) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['DM Sans Variable', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
    },
  },
  plugins: [],
}
