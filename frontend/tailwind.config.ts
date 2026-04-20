import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          red: '#FF0000',
          dark: '#0F0F0F',
        },
      },
    },
  },
  plugins: [],
};

export default config;
