#!/usr/bin/env node
/** Portable native-Node launcher; first-party bundling matches worker build.mjs. */
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {join} from "node:path";
import {mkdir, mkdtemp, rm, readFile} from "node:fs/promises";
import {spawn} from "node:child_process";
const worker = fileURLToPath(new URL("../../apps/document-worker/", import.meta.url));
const requireWorker = createRequire(join(worker, "package.json"));
const {build} = requireWorker("esbuild");
let temporary;
try {
  if (Number(process.versions.node.split(".")[0]) !== 24) throw new Error("Node24 required");
  await mkdir(join(worker, "dist"), {recursive: true});
  temporary = await mkdtemp(join(worker, "dist", "assessment-public-sdk-eval-"));
  const entry = join(temporary, "eval.mjs");
  const isolated=value=>value.replaceAll('-000000000201','-000000000711').replaceAll('-000000000202','-000000000712').replaceAll('-000000000993','-000000000713').replaceAll('origination-owner@','assessment-public-owner@').replaceAll('other-tenant@','assessment-public-outsider@').replaceAll('m07-publisher@','assessment-public-publisher@');
  let source=await readFile(join(worker,"scripts","capital-m07-native-sdk-eval.ts"),"utf8");
  source=isolated(source);
  const expandReturn="return readFileSync(path,'utf8').replace";
  if(!source.includes(expandReturn))throw new Error('assessment_sdk_expand_contract_changed');
  source=source.replace(expandReturn,"return isolated(readFileSync(path,'utf8').replace").replace("reference.trim())));}","reference.trim()))));}");
  source='const isolated='+isolated.toString()+';\n'+source;
  const marker="phase='physical-purge-fixture-clock';";
  if(source.split(marker).length!==2)throw new Error("assessment_existing_sdk_hook_changed");
  const content='import {evaluateAssessmentNativePublic} from "./assessment-native-public-sdk-eval";\n'+source.replace(marker,"await evaluateAssessmentNativePublic({db,client,realQueue,job});\n "+marker);
  await build({stdin:{contents:content,resolveDir:join(worker,"scripts"),sourcefile:"assessment-native-public-sdk-harness.ts",loader:"ts"}, outfile: entry,
    bundle: true, platform: "node", format: "esm", target: "node24", logLevel: "silent", plugins: [{name:"assessment-eval-namespace",setup(b){b.onLoad({filter:/assessment-native-public-sdk-eval\.ts$/},async args=>({contents:isolated(await readFile(args.path,'utf8')),loader:"ts"}));}},{name: "external-third-party", setup(b) {
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
} catch {process.stderr.write("assessment_native_public_sdk_launcher_failed\n"); process.exitCode = 1;}
finally {if (temporary) await rm(temporary, {recursive: true, force: true});}
