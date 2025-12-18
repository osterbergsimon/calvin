import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "inject-build-timestamp",
      transformIndexHtml(html) {
        const timestamp = new Date().toISOString();
        return html.replace(
          "<head>",
          `<head>\n    <meta name="build-timestamp" content="${timestamp}">`,
        );
      },
    },
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      // Ensure plugin components are included in the build
      // Vite's glob will automatically include them, but we can be explicit
      output: {
        // Use consistent chunk naming for better caching
        manualChunks: undefined, // Let Vite handle chunking automatically
      },
    },
  },
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.spec.js", "tests/**/*.test.js"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/", "*.config.js", "*.config.ts"],
    },
  },
});
