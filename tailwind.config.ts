import type { Config } from 'tailwindcss';

/**
 * Design tokens from docs/wireframe.html — steel-blue accent, warm cards, the
 * diff + score-band palette. Components use these semantic names, not raw hex.
 */
const config: Config = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        accent: { DEFAULT: '#3d5a80', soft: '#f0f4f8' },
        page: '#f8f7f4',
        card: '#faf9f6',
        ink: '#2a2a2a',
        muted: '#888888',
        line: '#d0cec8',
        diff: {
          ok: '#2d8a5e',
          'ok-bg': '#e6f5ed',
          bad: '#c0392b',
          'bad-bg': '#fde8e6',
        },
        band: { good: '#44aa99', mid: '#b9770e', bad: '#c0392b' },
        badge: { earned: '#d4a853', empty: '#e8dfd0' },
      },
      fontFamily: {
        // next/font (app/layout.tsx) exposes Noto Serif as this CSS variable.
        // Both keys point at it so nothing falls back to a system sans.
        serif: ['var(--font-noto-serif)', 'Georgia', 'Times New Roman', 'serif'],
        sans: ['var(--font-noto-serif)', 'Georgia', 'Times New Roman', 'serif'],
      },
      keyframes: {
        micpulse: {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.08)', opacity: '0.7' },
        },
      },
      animation: {
        micpulse: 'micpulse 2s infinite',
      },
    },
  },
  plugins: [],
};

export default config;
