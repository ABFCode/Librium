import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const isDev =  === "development";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: ["librium.dev"],
  },
});
