// vite.config.mjs or vite.config.js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const path = fileURLToPath(import.meta.url);

export default defineConfig({
  // Point Vite at /codenames/client where index.html lives
  root: join(dirname(path), "client"),
  plugins: [react()],
  build: {
    // This just silences the "not inside project root" warning
    emptyOutDir: true,
  },
});
