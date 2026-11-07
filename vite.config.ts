import { defineConfig } from "vite";

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      output: {
        entryFileNames: "game.js",
        assetFileNames: "[name][extname]",
      },
    },
  },
});
