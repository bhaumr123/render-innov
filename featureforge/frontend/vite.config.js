import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Module 6/7: this is the whole "why do I need a build tool" answer —
// Vite serves the app with instant reload while you edit, and later
// bundles it for real deployment. `plugin-react` teaches it to understand
// JSX (the HTML-looking syntax inside .jsx files).
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
