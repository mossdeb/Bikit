import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * The `@/` alias tsconfig gives the app (2026-09-24). Until Bikit Pro's
 * dictionary, no tested lib imported anything through it at runtime; the
 * libs that build sentences in the browser (report, setup, the parsers)
 * now do, and vitest has to resolve it the way Next does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
