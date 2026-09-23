/** Immutable technical preparation. Does not publish or change a financial method. */
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {resolve, relative, dirname, join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const require = createRequire(join(root,'apps/document-worker/package.json'));
const {build, version} = require('esbuild');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const externals = new Set(['node:crypto','node:zlib','node:util']);
// Parsed through unused barrels; these imports must be absent from the emitted artifact.
const parseOnlyExternals = new Set(['node:fs','node:path','stream','events','util','buffer','tty','os']);
const parseOnlyModules = new Set(['packages/credit-playbook/src/method-runtime-manifest.ts','packages/document-intelligence/src/governed-document-quarantine.ts']);
const directory = join(root,'apps/document-worker/preparers');
const entry = 'export {prepareReceivablesExecutionInput,receivablesPreparationVersion} from "./src/receivables-preparer-entry.ts";';
const safePath = path => typeof path === 'string' && !path.startsWith('/') && !path.includes('\\') && !path.split('/').includes('..');
const firstParty = path => safePath(path) && (path.startsWith('packages/') || path.startsWith('apps/document-worker/src/'));
export async function rebuildPreparer(release, sourceDirectory = directory) {
 if (!/^[a-f0-9]{64}$/.test(release.snapshotHash ?? '') || !/^[a-f0-9]{40}$/.test(release.sourceCommit ?? '')) throw Error('preparer_identity_invalid');
 const bytes = readFileSync(join(sourceDirectory,release.snapshotHash+'.sources.json'));
 if (sha(bytes)!==release.snapshotHash) throw Error('preparer_snapshot_mismatch');
 const snapshot = JSON.parse(bytes);
 if (snapshot.schemaVersion!=='technical-preparer-snapshot.v1' || snapshot.sourceCommit!==release.sourceCommit || snapshot.esbuildVersion!==version
   || snapshot.files.entry?.content!==entry || snapshot.files.entry?.loader!=='ts') throw Error('preparer_toolchain_mismatch');
 for (const [path,file] of Object.entries(snapshot.files)) {
  if (path==='entry') continue;
  if (!safePath(path) || (!path.startsWith('node_modules/') && (!firstParty(path) || snapshot.pinned[path]!==file.content))) throw Error('preparer_source_unpinned');
 }
 const result = await build({entryPoints:['entry'],bundle:true,write:false,metafile:true,logLevel:'silent',format:'cjs',platform:'node',target:'node24',minify:true,legalComments:'inline',plugins:[{name:'frozen-preparer',setup(b){
  b.onResolve({filter:/.*/},a=>{
   if(a.kind==='entry-point')return {path:'entry',namespace:'preparer'};
   const edge=snapshot.edges[a.importer]?.[a.path];
   if(!edge)throw Error('preparer_import_unrecorded');
   if(edge.external){
    if(!externals.has(edge.external) && !parseOnlyExternals.has(edge.external))throw Error('preparer_external_denied');
    return {path:edge.external,external:true,...(parseOnlyExternals.has(edge.external)?{sideEffects:false}:{})};
   }
   if(!snapshot.files[edge.path] || (edge.sideEffects===false && !parseOnlyModules.has(edge.path)))throw Error('preparer_source_missing');
   return {path:edge.path,namespace:'preparer',...(edge.sideEffects===false?{sideEffects:false}:{})};
  });
  b.onLoad({filter:/.*/,namespace:'preparer'},a=>({contents:snapshot.files[a.path].content,loader:snapshot.files[a.path].loader}));
 }}]});
 for (const out of Object.values(result.metafile.outputs)) {
  if(out.imports.some(i=>i.external && !externals.has(i.path)))throw Error('preparer_runtime_external_denied');
  for(const [path,info] of Object.entries(out.inputs)) if(parseOnlyModules.has(path.replace(/^preparer:/,'')) && info.bytesInOutput>0)throw Error('preparer_parse_only_became_runtime');
 }
 const artifact=result.outputFiles[0].contents,artifactHash=sha(artifact);
 if(release.artifactHash && release.artifactHash!==artifactHash)throw Error('preparer_artifact_mismatch');
 return {artifact,artifactHash};
}
export async function capturePreparer(commit) {
 if(!/^[a-f0-9]{40}$/.test(commit ?? ''))throw Error('preparer_commit_required');
 const git=(...args)=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:20e6});
 if(git('remote','get-url','origin').trim()!=='https://github.com/carlosevg100/offroad.git')throw Error('preparer_repository_untrusted');
 git('merge-base','--is-ancestor',commit,'origin/main');
 const committed=path=>{
  if(!(firstParty(path)||['pnpm-lock.yaml','tsconfig.base.json'].includes(path)) || !/^100(644|755) blob /.test(git('ls-tree',commit,'--',path)))throw Error('preparer_source_denied');
  return git('show',`${commit}:${path}`);
 };
 const pinned={'pnpm-lock.yaml':committed('pnpm-lock.yaml'),'tsconfig.base.json':committed('tsconfig.base.json')},files={},edges={};
 if(readFileSync(join(root,'pnpm-lock.yaml'),'utf8')!==pinned['pnpm-lock.yaml'])throw Error('preparer_installed_lock_differs');
 const canonical=path=>relative(root,path).split('\\').join('/');
 await build({stdin:{contents:entry,sourcefile:'preparer-entry.ts',resolveDir:join(root,'apps/document-worker'),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',target:'node24',plugins:[{name:'capture-preparer',setup(b){
  b.onResolve({filter:/.*/},async a=>{
   if(a.pluginData?.skip)return;
   const result=await b.resolve(a.path,{resolveDir:a.resolveDir,kind:a.kind,importer:a.importer,pluginData:{skip:true}});
   if(result.errors.length)return {errors:result.errors};
   if(result.external && !externals.has(a.path) && !parseOnlyExternals.has(a.path))throw Error('preparer_external_denied');
   const path=result.external?null:canonical(result.path);
   if(parseOnlyModules.has(path))result.sideEffects=false;
   const from=!a.importer || a.importer===join(root,'apps/document-worker/preparer-entry.ts') || a.importer==='apps/document-worker/preparer-entry.ts'?'entry':canonical(a.importer);
   (edges[from]??={})[a.path]=result.external?{external:a.path}:{path,...(parseOnlyModules.has(path)?{sideEffects:false}:{})};
   return result;
  });
  b.onLoad({filter:/.*/},a=>{
   const path=canonical(a.path);
   if(!safePath(path))throw Error('preparer_source_outside_repository');
   const content=readFileSync(a.path,'utf8'),loader=a.path.endsWith('.ts')?'ts':a.path.endsWith('.json')?'json':'js';
   if(!path.startsWith('node_modules/')){
    if(content!==committed(path))throw Error('preparer_source_differs_from_main:'+path);
    pinned[path]=content;
   }
   files[path]={content,loader};return {contents:content,loader,resolveDir:dirname(a.path)};
  });
 }}]});
 files.entry={content:entry,loader:'ts'};
 const bytes=JSON.stringify({schemaVersion:'technical-preparer-snapshot.v1',sourceCommit:commit,esbuildVersion:version,pinned,files,edges})+'\n';
 const snapshotHash=sha(bytes),lockPath=join(directory,'preparer-lock.json');
 mkdirSync(directory,{recursive:true});
 const lock=JSON.parse(readFileSync(lockPath,'utf8'));
 const id='r01-preparation.2026-09-23.v1';
 if(lock.schemaVersion!=='technical-preparer-lock.v1' || lock.releases.some(r=>r.id===id))throw Error('preparer_release_already_recorded');
 writeFileSync(join(directory,snapshotHash+'.sources.json'),bytes,{flag:'wx'});
 const release={id,sourceCommit:commit,snapshotHash,artifactHash:null};
 release.artifactHash=(await rebuildPreparer(release)).artifactHash;
 lock.releases.push(release);writeFileSync(lockPath,JSON.stringify(lock,null,2)+'\n');
 console.log(JSON.stringify({...release,files:Object.keys(files).length,grantsExecution:false}));
}
export async function buildPreparers() {
 const lock=JSON.parse(readFileSync(join(directory,'preparer-lock.json'),'utf8'));
 if(lock.schemaVersion!=='technical-preparer-lock.v1' || !Array.isArray(lock.releases) || new Set(lock.releases.map(r=>r.id)).size!==lock.releases.length)throw Error('preparer_lock_invalid');
 const output=join(root,'apps/document-worker/released-methods');mkdirSync(output,{recursive:true});
 for(const release of lock.releases){
  if(!/^[a-f0-9]{64}$/.test(release.artifactHash ?? ''))throw Error('preparer_artifact_identity_missing');
  const {artifact}=await rebuildPreparer(release);
  writeFileSync(join(output,release.artifactHash+'.cjs'),artifact);
 }
 const generated='// Generated from the append-only technical preparer lock. No execution grant.\nexport const releasedPreparers = '+JSON.stringify(lock.releases,null,2)+' as const;\n';
 if(readFileSync(join(root,'apps/document-worker/src/released-preparers.generated.ts'),'utf8')!==generated)throw Error('preparer_runtime_index_mismatch');
}
if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
 if(process.argv[2]==='capture')await capturePreparer(process.argv[3]);
 else if(process.argv[2]==='build')await buildPreparers();
 else throw Error('usage: preparer-release.mjs capture COMMIT | build');
}
