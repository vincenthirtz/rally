import { defineConfig } from "vite";
import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Exact load order from index.html — must match <script> tag order
const SCRIPT_FILES = [
  "js/lzstring.min.js",
  "js/qrcode.min.js",
  "js/rallies.js",
  "rallies/normandie.js",
  "rallies/lyon.js",
  "js/custom-loader.js",
  "js/photostore.js",
  "js/game.js",
  "js/photos.js",
  "js/map.js",
  "js/editor.js",
  "js/app.js",
];

// Assets that the production service worker should pre-cache
const PRODUCTION_ASSETS = [
  "./index.html",
  "./assets/app.js",
  "./assets/style.css",
  "./manifest.json",
  "./icons/icon-192x192.png",
  "./icons/icon-512x512.png",
  "./js/compress-worker.js",
];

/**
 * Custom Vite plugin for Rally Photo.
 * - Build only (dev serves files as-is).
 * - Concatenates all JS in strict order → single minified assets/app.js
 * - Minifies CSS → assets/style.css
 * - Rewrites index.html script/link tags for production paths
 * - Updates sw.js ASSETS array for production paths
 */
function rallyBuildPlugin() {
  return {
    name: "rally-build",
    apply: "build",

    transformIndexHtml: {
      order: "pre",
      handler(html) {
        let result = html;

        // Remove individual <script> tags for app JS files
        for (const file of SCRIPT_FILES) {
          const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          result = result.replace(
            new RegExp(
              `\\s*<script\\s+src=["']${escaped}["']\\s*>\\s*</script>`,
              "g"
            ),
            ""
          );
        }

        // Replace CSS link for built version
        result = result.replace(
          /(<link\s+rel=["']stylesheet["']\s+href=["'])css\/style\.css(["'])/,
          "$1assets/style.css$2"
        );

        // Insert bundled app.js after the Leaflet CDN script
        result = result.replace(
          /(<script\s+src=["']https:\/\/unpkg\.com\/leaflet@[^"']+["']\s*><\/script>)/,
          "$1\n  <script src=\"assets/app.js\"></script>"
        );

        return result;
      },
    },

    async generateBundle() {
      const { transform } = await import("esbuild");

      // --- Concatenate & minify all JS files ---
      const jsSource = SCRIPT_FILES.map((f) =>
        readFileSync(resolve(__dirname, f), "utf-8")
      ).join("\n;\n");

      const { code: appJs } = await transform(jsSource, {
        minify: true,
        target: "es2020",
      });

      this.emitFile({
        type: "asset",
        fileName: "assets/app.js",
        source: appJs,
      });

      // --- Minify CSS ---
      const cssSource = readFileSync(
        resolve(__dirname, "css/style.css"),
        "utf-8"
      );
      const { code: styleCss } = await transform(cssSource, {
        loader: "css",
        minify: true,
      });

      this.emitFile({
        type: "asset",
        fileName: "assets/style.css",
        source: styleCss,
      });

      // --- Update service worker ASSETS for production paths ---
      const swSource = readFileSync(
        resolve(__dirname, "public/sw.js"),
        "utf-8"
      );
      const swUpdated = swSource.replace(
        /const ASSETS = \[[\s\S]*?\];/,
        `const ASSETS = [\n${PRODUCTION_ASSETS.map(
          (a) => `  "${a}"`
        ).join(",\n")},\n];`
      );

      // Overwrite the copy from publicDir with the updated version
      this.emitFile({
        type: "asset",
        fileName: "sw.js",
        source: swUpdated,
      });
    },
  };
}

export default defineConfig({
  root: ".",
  publicDir: "public",
  plugins: [rallyBuildPlugin()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
  server: {
    open: true,
  },
});
