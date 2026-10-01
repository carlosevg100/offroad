#!/usr/bin/env node
/** Portable native-Node launcher; first-party bundling matches worker build.mjs. */
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import {mkdir, mkdtemp, rm} from "node:fs/promises";
import {spawn} from "node:child_process";
const worker = fileURLToPath(new URL("../../apps/document-worker/", import.meta.url));
const requireWorker = createRequire(join(worker, "package.json"));
const {build} = requireWorker("esbuild");
let temporary;
try {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Node24 required");
  await mkdir(join(worker, "dist"), {recursive: true});
  temporary = await mkdtemp(join(worker, "dist", "body-sdk-eval-"));
  const entry = join(temporary, "eval.mjs");
  await build({entryPoints: [join(worker, "scripts", "capital-body-sdk-eval.ts")], outfile: entry,
    bundle: true, platform: "node", format: "esm", target: "node24", logLevel: "silent", plugins: [{name: "external-third-party", setup(b) {
      b.onResolve({filter: /^[^.\/]/}, async args => {
        if (args.path.startsWith("@offroad/") || args.pluginData?.externalized) return null;
        const resolved = await b.resolve(args.path, {resolveDir: args.resolveDir, kind: args.kind, pluginData: {externalized: true}});
        if (resolved.errors.length) throw new Error("dependency resolution failed");
        return {path: resolved.path, external: true};
      });
    }}]});
  const code = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {stdio: "inherit", env: {...process.env, OFFROAD_REPOSITORY_ROOT: fileURLToPath(new URL("../../", import.meta.url))}});
    child.once("error", reject); child.once("exit", code => resolve(code ?? 1));
  });
  process.exitCode = code;
} catch {process.stderr.write("capital_body_sdk_launcher_failed\n"); process.exitCode = 1;}
finally {if (temporary) await rm(temporary, {recursive: true, force: true});}
