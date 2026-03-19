/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Định nghĩa màu cam thương hiệu của bạn nếu muốn dùng tên riêng
      colors: {
        brand: {
          orange: '#f97316', // Cam đậm (Orange-500)
          white: '#ffffff',
        }
      }
    },
  },
  plugins: [],
}