// Disposable localhost stack only. Exercises the deployed worker through its real RPC client.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {tmpdir} from 'node:os';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const database=new URL(process.env.OFFROAD_E2E_DATABASE_URL ?? 'invalid:');
assert(['postgres:','postgresql:'].includes(database.protocol) && ['localhost','127.0.0.1','[::1]'].includes(database.hostname) && !database.search && !database.hash,'local_database_required');
const env=Object.fromEntries(Object.entries(process.env).filter(([key])=>!key.startsWith('PG')));
const sql=query=>execFileSync('psql',['--dbname',database.href,'--no-psqlrc','-v','ON_ERROR_STOP=1','-Atq'],{input:query,env,encoding:'utf8',timeout:60000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']}).trim();
const literal=text=>`convert_from(decode('${Buffer.from(text).toString('hex')}','hex'),'UTF8')`;
const expand=path=>readFileSync(path,'utf8').replace(/^\\ir (.+)$/gm,(_line,p)=>expand(resolve(dirname(path),p)));
const sha=text=>createHash('sha256').update(text).digest('hex');
const require=createRequire(join(root,'apps/document-worker/package.json'));
const {build}=require('esbuild');
const temporary=mkdtempSync(join(tmpdir(),'offroad-consumer-proof-'));
try {
  const outfile=join(temporary,'fixture.mjs');
  await build({stdin:{contents:`export {capitalPacketV2Fixture} from './packages/financial-model/src/capital-indexed-contracts.test-support.ts';export {deriveExecutionProfile,executionCanonicalText} from './packages/agent-contracts/src/index.ts';export {releasedMethodArtifacts} from './apps/document-worker/src/released-methods.generated.ts';`,resolveDir:root},outfile,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
  const {capitalPacketV2Fixture,deriveExecutionProfile,executionCanonicalText,releasedMethodArtifacts}=await import(pathToFileURL(outfile));
  const release=releasedMethodArtifacts.find(r=>r.methodId==='prepare-capital-structure-decision');assert(release);
  const manifest=JSON.parse(readFileSync(join(root,'apps/document-worker/released-methods',release.artifactHash+'.manifest.json'),'utf8'));
  const profile=deriveExecutionProfile(manifest,{id:release.platformReleaseId,manifestHash:release.manifestHash});
  let packet=capitalPacketV2Fixture();
  const originalBasis=JSON.parse(packet.decision.review.composition.alternatives[0].projection.operating.envelope.canonical);
  const executor=require(join(root,'apps/document-worker/released-methods',release.artifactHash+'.cjs'));
  const profileText=executionCanonicalText(profile);
  const fixture=expand(join(root,'supabase/tests/support/execution_commands_fixture.sql'));
  const setup=sql(`begin;${fixture}
select set_config('offroad.synthetic_capital_basis',${literal(JSON.stringify(originalBasis))},true);
${expand(join(root,'supabase/tests/support/capital_consumer_basis_fixture.sql'))}
insert into private.platform_capability_releases(capability_key,released,exposure,method_id,method_version,method_maturity,approved_by,approved_at,approval_source)
values('synthetic-consumer-proof',true,'universal',${literal(release.methodId)},${literal(release.methodVersion)},'tested','Synthetic CI',current_date,'Disposable CI only');
insert into private.platform_method_releases(id,method_id,version,manifest_hash,manifest,components,evidence,approval,capability_key)
values(${literal(release.platformReleaseId)},${literal(release.methodId)},${literal(release.methodVersion)},${literal(release.manifestHash)},${literal(JSON.stringify(manifest))}::jsonb,'[]','["Synthetic CI only"]','{}','synthetic-consumer-proof');
insert into private.execution_method_profiles(id,platform_release_id,serialization_version,canonical_payload,payload_fingerprint,adapter_source_commit,review_evidence)
values('a4171000-0000-4000-9000-000000000099',${literal(release.platformReleaseId)},'offroad-execution-json-utf16-v1',${literal(profileText)},${literal(sha(profileText))},repeat('c',40),' {"result":"approved","subjectCommit":"cccccccccccccccccccccccccccccccccccccccc","reviewer":"Synthetic CI","sourceHash":"dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"}');
select 'BASIS:'||receipt::text from capital_consumer_basis_receipt;
select 'CONTRACT:'||(contract || jsonb_build_object('method',${literal(JSON.stringify(profile.method))}::jsonb))::text from execution_fixture;
drop trigger zzz_fixture_source_rights on public.source_versions;
drop trigger zz_synthetic_legacy_workspace_capabilities on public.organizations;
commit;`);
  const line=setup.split('\n').find(s=>s.startsWith('CONTRACT:'));assert(line,'contract_missing');
  const basisLine=setup.split('\n').find(s=>s.startsWith('BASIS:'));assert(basisLine,'basis_missing');
  const governed=JSON.parse(basisLine.slice(6));
  const remap=value=>{
    if(typeof value==='string')return governed.mapping[value]??value;
    if(Array.isArray(value))return value.map(remap);
    if(value && typeof value==='object'){
      if(Object.hasOwn(value,'canonical'))return governed.envelope;
      return Object.fromEntries(Object.entries(value).map(([key,child])=>[key,remap(child)]));
    }
    return value;
  };
  packet=remap(packet);
  const snapshot=executionCanonicalText(packet);
  const expected=executionCanonicalText(executor.capitalProcedurePacketV2OutputSchema.parse(executor.prepareCapitalProcedurePacketV2(executor.capitalProcedurePacketV2InputSchema.parse(packet))));
  const contract=JSON.parse(line.slice(9));contract.purpose=governed.purpose;contract.inputs.hypotheses=governed.pins;contract.inputs.fingerprint=sha(snapshot);
  const contractText=executionCanonicalText(contract);
  const request=JSON.parse(sql(`begin;select set_config('request.jwt.claim.sub','a11b0000-0000-4000-8000-000000000001',true);select private.request_work_execution_v1('a4171000-0000-4000-9000-000000000099',${literal(contractText)},${literal(snapshot)});commit;`).split('\n').at(-1));
  assert(request.jobId,'job_missing');
  const deadline=Date.now()+60000;let receipt;
  while(Date.now()<deadline){
    const observed=sql(`select row_to_json(r) from private.execution_result_receipts r where execution_id='a4171000-0000-4000-9000-000000000002';`);
    if(observed){receipt=JSON.parse(observed);break;}
    await new Promise(resolve=>setTimeout(resolve,500));
  }
  assert(receipt,'deployed_worker_did_not_commit');assert.equal(receipt.outcome,'succeeded');assert.equal(receipt.reason,'calculated');
  assert.equal(receipt.canonical_result,expected);assert.equal(receipt.result_fingerprint,sha(expected));
  assert.equal(receipt.input_fingerprint,sha(snapshot));assert.equal(receipt.contract_fingerprint,sha(contractText));
  assert.equal(sql(`select count(*) from private.execution_operation_receipts where execution_id='a4171000-0000-4000-9000-000000000002' and state='settled'`),'1');
  console.log('pinned_consumer_deployed_integration: PASS (real queue, RPC authorization, packaged calculation, exact result, one settled operation; disposable local stack)');
} finally {rmSync(temporary,{recursive:true,force:true});}
