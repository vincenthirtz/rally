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
  "js/sw-register.js",
];

// Assets that the production service worker should pre-cache
const PRODUCTION_ASSETS = [
  "./index.html",
  "./assets/app.js",
  "./assets/critical.css",
  "./assets/deferred.css",
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

        // Remove both CSS links (we emit them manually in generateBundle)
        // so Vite doesn't try to process them through its CSS pipeline
        result = result.replace(
          /\s*<!-- Critical CSS[^]*?<link\s+rel="stylesheet"\s+href="css\/critical\.css"\s*\/>/,
          ""
        );
        result = result.replace(
          /\s*<!-- Deferred CSS[^]*?<noscript><link\s+rel="stylesheet"\s+href="css\/deferred\.css"\s*\/><\/noscript>/,
          ""
        );

        // Insert production CSS links before </head>
        result = result.replace(
          /<\/head>/,
          `  <link rel="stylesheet" href="assets/critical.css" />\n` +
          `  <link rel="stylesheet" href="assets/deferred.css" media="print" onload="this.media='all'" />\n` +
          `  <noscript><link rel="stylesheet" href="assets/deferred.css" /></noscript>\n` +
          `</head>`
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

      // --- Minify CSS (critical + deferred) ---
      for (const cssFile of ["critical", "deferred"]) {
        const cssSource = readFileSync(
          resolve(__dirname, `css/${cssFile}.css`),
          "utf-8"
        );
        const { code: minCss } = await transform(cssSource, {
          loader: "css",
          minify: true,
        });

        this.emitFile({
          type: "asset",
          fileName: `assets/${cssFile}.css`,
          source: minCss,
        });
      }

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
    cssCodeSplit: false,
    rollupOptions: {
      input: resolve(__dirname, "index.html"),
    },
  },
  server: {
    open: true,
  },
});
