import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 3005,
    open: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000", // Using IP instead of localhost
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
