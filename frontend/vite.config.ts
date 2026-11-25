import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";

const rootDir = import.meta.dirname;
const siblingMatzUi = path.resolve(rootDir, "../../matz-ui/src");
const installedMatzUi = path.resolve(rootDir, "node_modules/@matz/ui/src");
const matzUiSrc = fs.existsSync(siblingMatzUi) ? siblingMatzUi : installedMatzUi;

export default defineConfig({
  resolve: {
    alias: {
      "@matz/ui/styles.css": path.resolve(matzUiSrc, "styles/matz-ui.css"),
      "@matz/ui/algorithms": path.resolve(matzUiSrc, "algorithms/index.ts"),
      "@matz/ui/diff": path.resolve(matzUiSrc, "diff/DiffEngine.ts"),
      "@matz/ui/icons": path.resolve(matzUiSrc, "icons/Icons.ts"),
      "@matz/ui": path.resolve(matzUiSrc, "index.ts"),
      "@xterm/xterm": path.resolve(rootDir, "node_modules/@xterm/xterm"),
      "@xterm/addon-fit": path.resolve(rootDir, "node_modules/@xterm/addon-fit"),
    },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
    target: "esnext",
  },
});
