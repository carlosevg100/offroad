/** Test-only historical input builder. No live first-party source resolution. */
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {posix,join} from 'node:path';
const sha=value=>createHash('sha256').update(value).digest('hex');
export const historicalCapitalInputSourceHash='c02eaa265805fde66fb20186d746dfe83f565da014e4cfa620d8fe427b3dfcb3';
export function historicalCapitalFixturePlugin(root,release,artifactPath,options={}) {
 const directory=join(root,'packages/credit-playbook/knowledge/releases');
 const fixtureBytes=readFileSync(join(root,'packages/credit-playbook/scripts/fixtures/capital-v4-historical-input.sources.json'));
 if(sha(fixtureBytes)!==historicalCapitalInputSourceHash)throw Error('historical_fixture_capsule_hash_mismatch');
 const fixture=JSON.parse(fixtureBytes);
 const snapshotBytes=readFileSync(join(directory,release.snapshotHash+'.sources.json'));
 if(sha(snapshotBytes)!==release.snapshotHash)throw Error('historical_fixture_executor_snapshot_mismatch');
 const snapshot=JSON.parse(snapshotBytes);
 if(fixture.sourceCommit!==release.sourceCommit||snapshot.sourceCommit!==release.sourceCommit||fixture.executorSnapshotHash!==release.snapshotHash
  ||fixture.entryHash!=='69e32e7afccf3e73875a817b34da0259dbe4fae6cc56ff151e6e02716cdf80c4')throw Error('historical_fixture_identity_mismatch');
 for(const [path,file]of Object.entries(fixture.files)) {
  const bytes=Buffer.from(file.content);
  const blob=createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex');
  if(sha(bytes)!==file.hash||blob!==file.gitBlob)throw Error('historical_fixture_source_hash_mismatch:'+path);
 }
 if(fixture.files[fixture.entryPath]?.hash!==fixture.entryHash)throw Error('historical_fixture_entry_mismatch');
 // A second immutable historical builder supports the pre-indexed v2 ledger.
 if(options.includeV1Runs) {
  const bytes=readFileSync(join(root,'packages/credit-playbook/scripts/fixtures/capital-v1-historical-input-builder.sources.json'));
  if(sha(bytes)!=='181e16e0a0a7be8a67bf4532ee7f9a0709bf0f7dc077fc067408bd32b9c2b23f')throw Error('historical_v1_fixture_hash_mismatch');
  const source=JSON.parse(bytes),body=Buffer.from(source.content);
  if(source.sourceCommit!==release.sourceCommit||sha(body)!==source.hash||createHash('sha1').update(Buffer.from('blob '+body.length+'\0')).update(body).digest('hex')!==source.gitBlob)throw Error('historical_v1_fixture_provenance_mismatch');
  fixture.files[source.path]=source;
 }
 const resolveSource=input=>{
  const path=posix.normalize(input);
  for(const candidate of[path,path+'.ts',path+'.tsx',path+'/index.ts'])if(snapshot.files[candidate]||fixture.files[candidate])return candidate;
  throw Error('historical_fixture_source_missing:'+path);
 };
 return {name:'historical-capital-input',setup(b){
  b.onResolve({filter:/.*/},args=>{
   if(args.kind==='entry-point')return{path:'fixture-entry',namespace:'historical'};
   if(args.path==='fixture-input-builder')return{path:fixture.entryPath,namespace:'historical'};
   if(args.path==='fixture-financial-version')return{path:'packages/financial-core/src/index.ts',namespace:'historical'};
   if(args.path===artifactPath)return{path:artifactPath,external:true};
   if(!options.useCapturedRuntime&&/capital-procedure-packet-v2(?:\.ts)?$/.test(args.path))return{path:'packet',namespace:'historical'};
   const edge=snapshot.edges[args.importer]?.[args.path];
   if(edge)return edge.external?{path:edge.external,external:true,...(edge.sideEffects===false?{sideEffects:false}:{})}:{path:edge.path,namespace:'historical',...(edge.sideEffects===false?{sideEffects:false}:{})};
   if(args.path.startsWith('node:'))return{path:args.path,external:true};
   if(args.path.startsWith('.'))return{path:resolveSource(posix.join(posix.dirname(args.importer),args.path)),namespace:'historical'};
   if(args.path.startsWith('@offroad/')) {
    const parts=args.path.slice(9).split('/'),pkg=parts.shift(),pkgPath='packages/'+pkg;
    const meta=fixture.files[pkgPath+'/package.json'];
    if(!meta)throw Error('historical_fixture_package_not_captured');
    const exported=JSON.parse(meta.content).exports[parts.length?'./'+parts.join('/') :'.'];
    return{path:resolveSource(pkgPath+'/'+(typeof exported==='string'?exported:exported.default)),namespace:'historical'};
   }
   const targets=[...new Set(Object.values(snapshot.edges).flatMap(edges=>edges[args.path]?.path?[edges[args.path].path]:[]))];
   if(targets.length!==1)throw Error('historical_fixture_dependency_not_captured');
   return{path:targets[0],namespace:'historical'};
  });
  b.onLoad({filter:/.*/,namespace:'historical'},args=>{
   if(args.path==='fixture-entry')return{contents:'export {buildCapitalProcedureV2Runs} from "fixture-input-builder";export {financialCoreVersion as fixtureFinancialCoreVersion} from "fixture-financial-version";'+(options.includeV1Runs?'export {buildCapitalProcedureRuns} from "./packages/financial-model/src/capital-procedure-runs.test-support";':''),loader:'js'};
   if(args.path==='packet')return{contents:`import released from ${JSON.stringify(artifactPath)};export const {prepareCapitalProcedurePacketV2,capitalProcedurePacketV2InputSchema,capitalProcedurePacketV2OutputSchema}=released;`,loader:'js'};
   const file=snapshot.files[args.path]??fixture.files[args.path];
   if(!file)throw Error('historical_fixture_source_missing');
   return{contents:file.content,loader:file.loader};
  });
 }};
}
