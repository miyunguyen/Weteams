import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './services/**/*.{ts,tsx}',
    './types/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        primary: '#00477f',
        background: '#feffff',
      },
      boxShadow: {
        container:
          '0 18px 45px rgba(0, 71, 127, 0.12), 0 2px 8px rgba(15, 23, 42, 0.06)',
      },
      backgroundImage: {
        'dashboard-glow':
          'radial-gradient(circle at top left, rgba(0, 71, 127, 0.16), transparent 36%), radial-gradient(circle at top right, rgba(0, 71, 127, 0.08), transparent 28%)',
      },
    },
  },
  plugins: [],
};

export default config;
