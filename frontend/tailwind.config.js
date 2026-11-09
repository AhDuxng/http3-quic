/**
 * Tailwind CSS configuration: source paths scanned for class names and the
 * brand color palette.
 */

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          orange: '#f97316',
          white: '#ffffff',
        },
      },
    },
  },
  plugins: [],
}
