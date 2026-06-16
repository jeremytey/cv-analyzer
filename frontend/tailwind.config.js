/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#F5F4F0',
        workspace: '#0C0C0C',
        'text-primary': '#FAFAFA',
        accent: '#E8E8E3',
        'score-high': '#D4F5D4',
        'score-mid': '#F5EDD4',
        'score-low': '#F5D4D4',
      },
      fontFamily: {
        mono: ['DM Mono', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
}