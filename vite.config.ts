import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig } from "vite";

export default defineConfig({
  server: { cors: false },
  plugins: [react(), tailwindcss(), cloudflare()],
});
