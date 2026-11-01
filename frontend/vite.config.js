import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { fileURLToPath, URL } from "node:url";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { createHash } from "crypto";
import customMedia from "./src/styles/customMedia.js";

// Get git version (commit short hash) for frontend version
function getGitVersion() {
  // First, try to use environment variable if set (from update script)
  if (process.env.GIT_COMMIT_HASH) {
    const envVersion = process.env.GIT_COMMIT_HASH.trim();
    if (envVersion && envVersion.length >= 7) {
      return envVersion;
    }
  }

  try {
    // Get the project root (parent of frontend directory)
    const frontendDir = dirname(fileURLToPath(import.meta.url));
    const projectRoot = join(frontendDir, "..");

    // Check if .git directory exists
    const gitDir = join(projectRoot, ".git");
    if (!existsSync(gitDir)) {
      return null;
    }

    // Try to get git version, with better error handling
    const version = execSync("git rev-parse --short HEAD", {
      cwd: projectRoot,
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "pipe"], // Ignore stdin, capture stdout/stderr
      timeout: 5000, // 5 second timeout
    }).trim();

    // Validate that we got a reasonable hash (7 characters)
    if (version && version.length >= 7) {
      return version;
    }

    console.warn(`[vite] Warning: Got unexpected git version: "${version}"`);
    return null;
  } catch (error) {
    // Git not available or error occurred - log for debugging but don't fail build
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[vite] Warning: Could not get git version: ${error.message}`);
    }
    return null;
  }
}

const frontendVersion = getGitVersion();

// Stamp public/sw.js (copied verbatim into dist/) with a hash of this build's
// output file names. Those names carry content hashes, so every deploy that
// changes the UI gets new service-worker cache names and the browser sees a
// changed sw.js, which makes it install the new worker and drop old caches.
function serviceWorkerBuildId() {
  let buildId = null;
  let outDir = "dist";
  return {
    name: "calvin-sw-build-id",
    apply: "build",
    configResolved(config) {
      outDir = config.build.outDir;
      if (!outDir.startsWith("/")) outDir = join(config.root, outDir);
    },
    generateBundle(_options, bundle) {
      const names = Object.keys(bundle).sort().join("\n");
      buildId = createHash("sha256").update(names).digest("hex").slice(0, 12);
    },
    closeBundle() {
      const swPath = join(outDir, "sw.js");
      if (!buildId || !existsSync(swPath)) return;
      const source = readFileSync(swPath, "utf-8");
      writeFileSync(swPath, source.replaceAll("__CALVIN_BUILD_ID__", buildId));
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    serviceWorkerBuildId(),
    {
      name: "inject-build-timestamp",
      transformIndexHtml(html) {
        const timestamp = new Date().toISOString();
        const versionMeta = frontendVersion
          ? `\n    <meta name="frontend-version" content="${frontendVersion}">`
          : "";
        return html.replace(
          "<head>",
          `<head>\n    <meta name="build-timestamp" content="${timestamp}">${versionMeta}`
        );
      },
    },
  ],
  css: {
    // `@media (--bp-phone)` etc.: the shared breakpoint set (src/styles/breakpoints.js).
    postcss: { plugins: [customMedia()] },
  },
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
      // Optimize chunk splitting for better caching
      output: {
        manualChunks: id => {
          // Split vendor chunks
          if (id.includes("node_modules")) {
            // Vue ecosystem
            if (id.includes("vue") || id.includes("vue-router") || id.includes("pinia")) {
              return "vendor-vue";
            }
            // Vue Query
            if (id.includes("@tanstack/vue-query")) {
              return "vendor-query";
            }
            // VueUse
            if (id.includes("@vueuse")) {
              return "vendor-vueuse";
            }
            // Other large dependencies
            if (id.includes("axios") || id.includes("vuedraggable")) {
              return "vendor-utils";
            }
            // All other node_modules
            return "vendor";
          }
          // Split plugin components into separate chunks
          if (id.includes("/components/plugins/")) {
            return "plugins";
          }
          // Split settings components into separate chunks
          if (id.includes("/components/settings/")) {
            return "settings";
          }
        },
        // Optimize chunk file names for caching
        chunkFileNames: "assets/js/[name]-[hash].js",
        entryFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash].[ext]",
      },
      // Enable tree shaking
      treeshake: {
        preset: "recommended",
      },
    },
    // Optimize chunk size warnings
    chunkSizeWarningLimit: 1000,
    // Enable source maps for production debugging (optional)
    sourcemap: false,
  },
  server: {
    // Honor an externally assigned port (e.g. tooling that sets PORT); default 5173.
    port: process.env.PORT ? Number(process.env.PORT) : undefined,
    proxy: {
      "/api": {
        target: process.env.VITE_API_PROXY_TARGET || "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    // Resolve CommonJS modules the way the Vite 8/Rolldown production build
    // does: a default import of a CJS package is its module object, not the
    // `.default` property. Vitest's default synthetic interop is more
    // forgiving and hid CLV-18 ("SimpleKeyboard is not a constructor").
    deps: { interopDefault: false },
    setupFiles: ["./tests/setup.js"],
    include: ["tests/**/*.spec.js", "tests/**/*.test.js"],
    exclude: ["tests/e2e/**/*", "node_modules/**/*"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html"],
      exclude: ["node_modules/", "tests/", "*.config.js", "*.config.ts"],
    },
  },
});
