/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        chaos: {
          red: '#c0392b',
          dark: '#1a2330',
          panel: '#243042',
        },
      },
    },
  },
  plugins: [],
};
