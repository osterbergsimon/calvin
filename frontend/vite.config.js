import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { execSync } from "child_process";
import { join, dirname } from "path";

// Get git version (commit short hash) for frontend version
function getGitVersion() {
  try {
    // Get the project root (parent of frontend directory)
    const frontendDir = dirname(fileURLToPath(import.meta.url));
    const projectRoot = join(frontendDir, "..");
    const version = execSync("git rev-parse --short HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: "pipe",
    }).trim();
    return version;
  } catch (error) {
    // Git not available or error occurred
    return null;
  }
}

const frontendVersion = getGitVersion();

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    {
      name: "inject-build-timestamp",
      transformIndexHtml(html) {
        const timestamp = new Date().toISOString();
        const versionMeta = frontendVersion
          ? `\n    <meta name="frontend-version" content="${frontendVersion}">`
          : "";
        return html.replace(
          "<head>",
          `<head>\n    <meta name="build-timestamp" content="${timestamp}">${versionMeta}`,
        );
      },
    },
  ],
  define: {
    __FRONTEND_VERSION__: JSON.stringify(frontendVersion),
  },
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
