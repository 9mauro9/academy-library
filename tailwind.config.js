/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        arista: {
          navy: '#090e1a',
          blue: '#146095',
          lightblue: '#4473a9',
          orange: '#d47122',
          green: '#aad037',
          yellow: '#e9d554',
          gray: '#bbbdc0',
          darkgray: '#58585B',
          grayblue: '#738a96',
        },
        bg: {
          primary: 'var(--bg-primary)',
          secondary: 'var(--bg-secondary)',
          tertiary: 'var(--bg-tertiary)',
        },
        text: {
          main: 'var(--text-primary)',
          sub: 'var(--text-secondary)',
          muted: 'var(--text-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent-color)',
        },
        border: {
          DEFAULT: 'var(--border-color)',
        }
      },
      fontFamily: {
        sans: ['Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      }
    },
  },
  plugins: [],
}
