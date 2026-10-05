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
  const isolated=value=>value.replaceAll('-000000000201','-000000000711').replaceAll('-000000000202','-000000000712').replaceAll('-000000000993','-000000000713').replaceAll('origination-owner@','assessment-public-owner@').replaceAll('other-tenant@','assessment-public-outsider@').replaceAll('m07-publisher@','assessment-public-publisher@').replaceAll('m07-sql-account','assessment-public-sql-account').replaceAll('m07-sql-project','assessment-public-sql-project').replaceAll('m07-sql-key','assessment-public-sql-key').replaceAll('origination-thesis-worker-test','assessment-public-worker-test').replaceAll("'w'.repeat(64)","'p'.repeat(64)").replaceAll("repeat('w', 64)","repeat('p', 64)").replaceAll('https://example.invalid/capture-licensed','https://example.invalid/capture-assessment-public');
  let source=await readFile(join(worker,"scripts","capital-m07-native-sdk-eval.ts"),"utf8");
  source=isolated(source);
  const fixture=isolated(await readFile(fileURLToPath(new URL("../../supabase/tests/support/capital_m07_native_sdk_fixture.sql",import.meta.url)),"utf8"));
  for(const original of ['m07-sql-account','m07-sql-project','m07-sql-key','https://example.invalid/capture-licensed',"'w'.repeat(64)","repeat('w', 64)",'-000000000201','-000000000202','-000000000993']){
    if(source.includes(original)||fixture.includes(original))throw new Error('assessment_public_namespace_not_isolated');
  }
  for(const identity of ['assessment-public-sql-account','assessment-public-sql-project','assessment-public-sql-key','https://example.invalid/capture-assessment-public']){
    if(!source.includes(identity)||!fixture.includes(identity))throw new Error('assessment_public_namespace_binding_mismatch');
  }
  if(!source.includes("workerToken:'p'.repeat(64)")||!fixture.includes("extensions.digest(repeat('p', 64), 'sha256')"))throw new Error('assessment_public_worker_binding_mismatch');
  // psql's verbose error yields a SQLSTATE and a closed identifier/category.
  // Never forward stderr: it can contain SQL values, source bodies or secrets.
  const sqlDiagnostic=stderr=>{
    if(typeof stderr!=='string')return {};
    const match=/ERROR:\s+([A-Z0-9]{5}):\s+([^\r\n]+)/.exec(stderr);
    const code=match?.[1]??null, message=match?.[2]??'';
    const category=/^[a-z][a-z0-9_]{2,119}$/.test(message)?message:null;
    const constraint=/CONSTRAINT NAME:\s+([a-z_][a-z0-9_]{0,62})/.exec(stderr)?.[1]??null;
    const table=/TABLE NAME:\s+([a-z_][a-z0-9_]{0,62})/.exec(stderr)?.[1]??null;
    return {code,category,constraint,table};
  };
  if(sqlDiagnostic('ERROR:  23505: provider_assurance_overlap').category!=='provider_assurance_overlap'||sqlDiagnostic('ERROR:  23505: duplicate key value violates unique constraint "synthetic_pkey"\nCONSTRAINT NAME: synthetic_pkey').constraint!=='synthetic_pkey'||sqlDiagnostic('ERROR:  23505: private body with spaces').category!==null)throw new Error('assessment_public_sql_diagnostic_invalid');
  const sqlOld="if(result.error||result.status!==0)throw new Error('local SQL failed');";
  if(source.split(sqlOld).length!==2)throw new Error('assessment_public_sql_contract_changed');
  source=source.replace("'ON_ERROR_STOP=1','-Atq'","'ON_ERROR_STOP=1','-v','VERBOSITY=verbose','-Atq'").replace(sqlOld,"if(result.error||result.status!==0){process.stderr.write(JSON.stringify({eval:'assessment_native_public_sdk',event:'fixture-sql-failure',phase,...assessmentSqlDiagnostic(result.stderr)})+'\\n');throw new Error('local SQL failed');}");
  source='const assessmentSqlDiagnostic='+sqlDiagnostic.toString()+';\n'+source;
  // Keep the inherited runtime body untouched. Diagnose only PostgreSQL's
  // missing SQL identifier, never the raw error or source/model content.
  const identifier=(code,message)=>{if(code!=='42P01'||typeof message!=='string')return {};const relation=/relation "([a-z_][a-z0-9_.]{0,126})" does not exist/.exec(message)?.[1];const alias=/missing FROM-clause entry for table "([a-z_][a-z0-9_]{0,62})"/.exec(message)?.[1];return relation?{missingRelation:relation}:alias?{missingFromAlias:alias}:{};};
  if(identifier('42P01','relation "private.synthetic_relation" does not exist').missingRelation!=='private.synthetic_relation'||identifier('42P01','missing FROM-clause entry for table "synthetic_alias"').missingFromAlias!=='synthetic_alias'||Object.keys(identifier('42501','relation "private.synthetic_relation" does not exist')).length||Object.keys(identifier('42P01','raw body or values')).length)throw new Error('assessment_public_identifier_diagnostic_invalid');
  const errorCategory="category:typeof message==='string'&&/^[a-z0-9_]{3,120}$/.test(message)?message:null";
  if(source.split(errorCategory).length!==2)throw new Error('assessment_public_error_diagnostic_contract_changed');
  source=source.replace(errorCategory,errorCategory+",...assessmentSqlIdentifier(code,message)");
  source='const assessmentSqlIdentifier='+identifier.toString()+';\n'+source;

  const expandReturn="return readFileSync(path,'utf8').replace";
  if(!source.includes(expandReturn))throw new Error('assessment_sdk_expand_contract_changed');
  source=source.replace(expandReturn,"return isolated(readFileSync(path,'utf8').replace").replace("reference.trim())));}","reference.trim()))));}");
  source='const isolated='+isolated.toString()+';\n'+source;
  const marker="phase='physical-purge-fixture-clock';";
  if(source.split(marker).length!==2)throw new Error("assessment_existing_sdk_hook_changed");
  const content='import {evaluateAssessmentNativePublic} from "./assessment-native-public-sdk-eval";\n'+source.replace(marker,"await evaluateAssessmentNativePublic({db,client,realQueue,job,workerToken:'p'.repeat(64)});\n "+marker);
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
