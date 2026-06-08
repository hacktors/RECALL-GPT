export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"]
      },
      spacing: {
        drawer: "25rem"
      },
      colors: {
        ink: "#161A1D",
        paper: "#FAFAF7",
        line: "#DAD7CD",
        moss: "#588157",
        pine: "#344E41",
        amber: "#C77D1A"
      }
    }
  },
  plugins: []
};
