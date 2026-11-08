import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, "index.html"),
        demo: resolve(__dirname, "demo.html"),
        style: resolve(__dirname, "style-test.html"),
      },
      output: {
        entryFileNames: (chunk) => (chunk.name === "main" ? "game.js" : "[name].js"),
        chunkFileNames: "[name].js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
