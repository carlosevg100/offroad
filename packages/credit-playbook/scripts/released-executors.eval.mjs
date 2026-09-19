import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync,mkdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {rebuildReleasedExecutor} from './build-released-executors.mjs';
const root=resolve(fileURLToPath(new URL('../../..',import.meta.url)));
const require=createRequire(join(root,'apps/document-worker/package.json'));
const {build}=require('esbuild');
const directory=join(root,'packages/credit-playbook/knowledge/releases');
const release=JSON.parse(readFileSync(join(directory,'method-release-lock.json'))).releases[0];

test('identical published sources reproduce identical artifact bytes',async()=>{
 const a=await rebuildReleasedExecutor(release),b=await rebuildReleasedExecutor(release);
 assert.equal(a.artifactHash,release.artifactHash); assert.deepEqual(a.artifact,b.artifact);
});
test('altered pinned snapshot is refused before compilation',async()=>{
 const tmp=mkdtempSync(join(tmpdir(),'offroad-release-tamper-'));
 try{const bytes=readFileSync(join(directory,release.snapshotHash+'.sources.json'),'utf8');writeFileSync(join(tmp,release.snapshotHash+'.sources.json'),bytes.replace('Decimal','ChangedDecimal'));await assert.rejects(()=>rebuildReleasedExecutor(release,tmp),/release_snapshot_hash_mismatch/);}finally{rmSync(tmp,{recursive:true,force:true});}
});
test('substituted artifact digest and changed toolchain are refused',async()=>{
 await assert.rejects(()=>rebuildReleasedExecutor({...release,artifactHash:'0'.repeat(64)}),/release_artifact_hash_mismatch/);
 await assert.rejects(()=>rebuildReleasedExecutor({...release,sourceCommit:'0'.repeat(40)}),/release_build_toolchain_mismatch/);
});
test('real worker loader refuses missing or modified artifact, even after a valid cached load',async()=>{
 const tmp=mkdtempSync(join(tmpdir(),'offroad-release-loader-'));
 try{
  mkdirSync(join(tmp,'src'));mkdirSync(join(tmp,'released-methods'));
  const outfile=join(tmp,'src/loader.mjs');
  await build({entryPoints:[join(root,'apps/document-worker/src/released-method-executor.ts')],outfile,bundle:true,platform:'node',format:'esm',target:'node24'});
  const loader=await import(pathToFileURL(outfile));
  assert.throws(()=>loader.loadReleasedReceivables(),/ENOENT/);
  const {artifact}=await rebuildReleasedExecutor(release),file=join(tmp,'released-methods',release.artifactHash+'.cjs');
  writeFileSync(file,artifact); assert.equal(typeof loader.loadReleasedReceivables().underwriteReceivablesPool,'function');
  writeFileSync(file,Buffer.concat([artifact,Buffer.from('\n// changed')]));
  assert.throws(()=>loader.loadReleasedReceivables(),/published_method_artifact_mismatch/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
