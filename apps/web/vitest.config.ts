import {fileURLToPath} from "node:url";

import {defineConfig} from "vitest/config";

/**
 * The `@/` alias, so a value import resolves in tests the way it resolves in the build.
 *
 * It worked by accident until now: every `@/` import in this app was `import type`, which is
 * erased before anything has to resolve it. The first ordinary import through the alias failed
 * to load a test file that had nothing to do with it, which is a confusing way to find out that
 * the test runner and the bundler disagree about what the app's own paths mean.
 */
export default defineConfig({
  test: {
    // Playwright owns `e2e/`; declaring a config here replaced the defaults that used to keep
    // the two runners out of each other's way.
    exclude: ["**/node_modules/**", "**/dist/**", "**/.next/**", "e2e/**"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
