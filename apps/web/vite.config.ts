import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    // Web gọi /api/* tương đối; vite chuyển tiếp sang api ở 3001.
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
