/** @type {import('tailwindcss').Config} */
// Token names mirror clipmaxxing/aimmaxxer for cross-project component reuse.
// Each token resolves to a CSS variable so the active profile theme
// (Val / Sonic / DMC / BO3) can swap colors at runtime via ProfileProvider.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          base: 'var(--bg-base)',
          raised: 'var(--bg-raised)',
          card: 'var(--bg-card)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          dark: 'var(--accent-dark)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          dark: 'var(--secondary-dark)',
        },
        text: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-muted)',
          subtle: 'var(--text-subtle)',
        },
        border: {
          DEFAULT: 'var(--border)',
          glow: 'var(--border-glow)',
        },
      },
      fontFamily: {
        sans: ['var(--font-body)', 'Inter', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        hero: ['var(--font-heading)', 'Inter', '-apple-system', 'sans-serif'],
        serif: ['"Cormorant Garamond"', 'Georgia', 'serif'],
      },
      keyframes: {
        'reveal-up': {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'float-slow': {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-8px)' },
        },
        'pulse-accent': {
          '0%, 100%': { boxShadow: '0 0 0 0 var(--border-glow)' },
          '50%': { boxShadow: '0 0 0 12px transparent' },
        },
        'gradient-drift': {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '50%': { transform: 'translate(-3%, 2%) scale(1.05)' },
        },
      },
      animation: {
        'reveal-up': 'reveal-up 700ms cubic-bezier(0.16, 1, 0.3, 1) both',
        'float-slow': 'float-slow 6s ease-in-out infinite',
        'pulse-accent': 'pulse-accent 2.4s ease-in-out infinite',
        'gradient-drift': 'gradient-drift 24s ease-in-out infinite',
      },
      boxShadow: {
        'accent-glow': '0 0 20px var(--border-glow)',
        'accent-glow-lg': '0 0 40px var(--border-glow)',
      },
      backgroundImage: {
        'dot-grid':
          'radial-gradient(circle at 1px 1px, var(--border) 1px, transparent 0)',
      },
      backgroundSize: {
        'dot-grid': '24px 24px',
      },
    },
  },
  plugins: [],
}
