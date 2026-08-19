#!/usr/bin/env node
/**
 * Build the worker into something Node can actually run.
 *
 * This monorepo is written for a bundler on purpose — `moduleResolution: Bundler`, every
 * `@offroad/*` package exporting `./src/index.ts` — so the app, the tests and the
 * type-checker read source with no build step in between. Plain `tsc` output inherits that
 * assumption and emits extensionless relative imports (`./config`), which Node's ESM loader
 * refuses; and once a workspace package lands inside `node_modules`, Node will not strip its
 * types either, whatever the flag. The worker is the first thing here that Node runs
 * directly, so the worker is what gets a bundler.
 *
 * What is bundled and what is not, deliberately:
 *
 *   - **First-party code is bundled.** `@offroad/*` and this app's own modules become one
 *     file. That is what removes both problems above at the root.
 *   - **Third-party code stays external.** pdfjs, SheetJS, jszip and the provider SDKs are
 *     loaded from `node_modules` exactly as they are published. Bundling them would mean
 *     rewriting libraries that use workers, `import.meta.url` and optional native bindings —
 *     a class of breakage that shows up at run time, on a real document, in production.
 *
 * Type checking is not this file's job; `tsc --noEmit` runs before it in the build script.
 */
import {build} from "esbuild";
import {fileURLToPath} from "node:url";
import {dirname, join} from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

/** Anything that is not ours and not relative is resolved from node_modules at run time. */
const externaliseThirdParty = {
  name: "externalise-third-party",
  setup(pluginBuild) {
    pluginBuild.onResolve({filter: /^[^.\/]/}, (args) => {
      if (args.path.startsWith("@offroad/")) return null;
      return {path: args.path, external: true};
    });
  },
};

const result = await build({
  entryPoints: [join(here, "src", "main.ts")],
  outfile: join(here, "dist", "main.js"),
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node24",
  sourcemap: true,
  logLevel: "info",
  plugins: [externaliseThirdParty],
  metafile: true,
});

const bundled = Object.keys(result.metafile.inputs).filter((file) => !file.includes("node_modules"));
console.log(`bundled ${bundled.length} first-party modules into dist/main.js`);
