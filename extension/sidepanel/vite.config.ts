import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
    build: {
    rollupOptions: {
      input: {
        side_panel: "index.html",
        background: "src/background/index.ts",
      },
      output: {
        entryFileNames: "[name].js",
      },
    },
    outDir: "dist",
  },
  plugins: [react(), tailwindcss()],
});