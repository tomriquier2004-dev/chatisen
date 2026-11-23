import { defineConfig } from "tsup";

// Un seul fichier dist/server.js : @chatisen/shared (sources TypeScript) est inclus dans le bundle,
// les dépendances npm restent externes et sont installées dans l'image.
export default defineConfig({
  entry: ["src/server.ts"],
  format: ["esm"],
  target: "node22",
  platform: "node",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  noExternal: ["@chatisen/shared"],
});
