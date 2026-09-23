import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {rebuildPreparer} from './preparer-release.mjs';
const require=createRequire(import.meta.url);
const directory=new URL('../preparers/',import.meta.url);
const lock=JSON.parse(readFileSync(new URL('preparer-lock.json',directory),'utf8'));
const release=lock.releases[0];
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const temporary=fn=>{const dir=mkdtempSync(join(tmpdir(),'offroad-preparer-eval-'));return Promise.resolve().then(()=>fn(dir)).finally(()=>rmSync(dir,{recursive:true,force:true}));};
test('preparer rebuild is byte reproducible and its runtime exports the exact technical identity',async()=>temporary(async dir=>{
 const first=await rebuildPreparer(release),second=await rebuildPreparer(release);
 assert.deepEqual(first.artifact,second.artifact);assert.equal(first.artifactHash,release.artifactHash);
 const file=join(dir,'preparer.cjs');writeFileSync(file,first.artifact);
 const runtime=require(file);
 assert.equal(runtime.receivablesPreparationVersion,release.id);
 assert.equal(typeof runtime.prepareReceivablesExecutionInput,'function');
 assert.throws(()=>runtime.prepareReceivablesExecutionInput({sessionId:'synthetic',evidence:[],confirmedScope:null}),/scope_confirmation_required/);
}));
test('preparer rejects altered snapshot bytes before loading code',async()=>temporary(async dir=>{
 writeFileSync(join(dir,release.snapshotHash+'.sources.json'),'{}');
 await assert.rejects(rebuildPreparer(release,dir),/preparer_snapshot_mismatch/);
}));
test('preparer rejects an altered expected artifact hash',async()=>{
 await assert.rejects(rebuildPreparer({...release,artifactHash:'0'.repeat(64)}),/preparer_artifact_mismatch/);
});
test('preparer refuses an unpinned first-party file even when a changed snapshot hash is supplied',async()=>temporary(async dir=>{
 const snapshot=JSON.parse(readFileSync(new URL(release.snapshotHash+'.sources.json',directory),'utf8'));
 snapshot.files['apps/document-worker/src/receivables-preparer-entry.ts'].content+='\n// changed\n';
 const bytes=JSON.stringify(snapshot),snapshotHash=sha(bytes);writeFileSync(join(dir,snapshotHash+'.sources.json'),bytes);
 await assert.rejects(rebuildPreparer({...release,snapshotHash},dir),/preparer_source_unpinned/);
}));
test('preparer refuses a runtime network import rather than widening the deterministic boundary',async()=>temporary(async dir=>{
 const snapshot=JSON.parse(readFileSync(new URL(release.snapshotHash+'.sources.json',directory),'utf8'));
 const importer=Object.keys(snapshot.edges).find(path=>snapshot.edges[path]['node:crypto']);
 assert.ok(importer);snapshot.edges[importer]['node:crypto']={external:'node:https'};
 const bytes=JSON.stringify(snapshot),snapshotHash=sha(bytes);writeFileSync(join(dir,snapshotHash+'.sources.json'),bytes);
 await assert.rejects(rebuildPreparer({...release,snapshotHash},dir),/preparer_external_denied/);
}));

test('snapshot distinguishes the synthetic entry from the actual receivables entry module',()=>{
 const snapshot=JSON.parse(readFileSync(new URL(release.snapshotHash+'.sources.json',directory),'utf8'));
 assert.ok(snapshot.edges.entry['./src/receivables-preparer-entry.ts']);
 assert.ok(snapshot.edges['apps/document-worker/src/receivables-preparer-entry.ts']['./receivables-preparation-history']);
 assert.equal(snapshot.edges.entry['./receivables-preparation-history'],undefined);
});
