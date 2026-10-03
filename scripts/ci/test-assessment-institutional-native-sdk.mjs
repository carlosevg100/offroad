#!/usr/bin/env node
/** Isolated real-body 3V eval using the maintained local material Auth bootstrap.
 * No mutation of its default SDK; no operational or remote fixture support. */
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {mkdir,mkdtemp,rm,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
const worker=fileURLToPath(new URL('../../apps/document-worker/',import.meta.url));
const require=createRequire(join(worker,'package.json'));const {build}=require('esbuild');
let temporary;
try{
 if(Number(process.versions.node.split('.')[0])!==24)throw new Error('Node24 required');
 let source=await readFile(join(worker,'scripts/material-production-native-sdk-eval.ts'),'utf8');
 // A separate namespace; all historical fixture IDs and tokens remain disjoint.
 source=source.replace("const prefix=mode==='success'?'d5':", "const prefix=mode==='success'?'e8':").replace("token=mode==='success'?'r':", "token=mode==='success'?'u':").replace("const fixturePassword=uiFixture?randomUUID()+randomUUID():'material-local-sdk-only';","const fixturePassword=uiFixture?randomUUID()+randomUUID():'assessment-institutional-local-sdk-only';").replaceAll('`material-${mode}', '`assessment-institutional-${mode}');
 // The runtime value changes, but the search key must match the checked-in
 // SQL template. A global rename silently creates an unusable Auth password.
 const passwordBinding="bootstrap=bootstrap.replaceAll('material-local-sdk-only',fixturePassword);";
 if(!source.includes(passwordBinding)||!source.includes("const fixturePassword=uiFixture?randomUUID()+randomUUID():'assessment-institutional-local-sdk-only';"))throw new Error('auth_password_binding_contract_changed');
 const fixtureTemplate=await readFile(join(worker,'../../supabase/tests/support/material_production_native_sdk_fixture.sql'),'utf8');
 if(!fixtureTemplate.includes("extensions.crypt('material-local-sdk-only',"))throw new Error('auth_password_template_contract_changed');
 const runtimePassword=/const fixturePassword=uiFixture\?randomUUID\(\)\+randomUUID\(\):'([^']+)';/.exec(source)?.[1];
 if(!runtimePassword)throw new Error('auth_login_password_contract_changed');
 const expandedAuth=fixtureTemplate.replaceAll('material-local-sdk-only',runtimePassword);
 const encryptedPasswordInput=/extensions\.crypt\('([^']+)',/.exec(expandedAuth)?.[1];
 if(encryptedPasswordInput!==runtimePassword)throw new Error('auth_expanded_password_binding_mismatch');
 const bootstrapEnd='sql(db,bootstrap);';if(source.split(bootstrapEnd).length!==2)throw new Error('bootstrap_contract_changed');
 source=source.replace(bootstrapEnd,"const predecessorAt=bootstrap.indexOf('-- The intake analysis has finished:');const authAt=bootstrap.indexOf('update auth.users set instance_id=');assert.ok(predecessorAt>0&&authAt>predecessorAt);sql(db,bootstrap.slice(0,predecessorAt)+bootstrap.slice(authAt));");
 const confirm='mark(`${mode}_confirm_intake`);';if(source.split(confirm).length!==2)throw new Error('confirm_contract_changed');
 source=source.replace(confirm,"const institutionalInput={db,root,owner,worker,queue:createQueueClient(worker,{workerToken,leaseSeconds:600}),org,session,actor};mark('institutional_private_upload_scan');const institutionalSources=await uploadInstitutionalInputs(institutionalInput);sql(db,'begin;'+bootstrap.slice(predecessorAt,authAt).replace('  1, \\'upload\\'', '  2, \\'upload\\'')+'commit;');mark('institutional_configuration_human_review');const institutionalApproved=await approveInstitutionalInputs(institutionalInput,institutionalSources);\n "+confirm);
 const materialAt=source.indexOf(' const physical=createCapitalMaterialStorageTransport(');const mainAt=source.indexOf('\nasync function main()');if(materialAt<0||mainAt<materialAt)throw new Error('material_route_contract_changed');
 source=source.slice(0,materialAt)+" mark('institutional_assessment_real_case_capture');await captureInstitutionalAssessment(institutionalInput,job,institutionalApproved);\n}\n"+source.slice(mainAt);
 source=source.replace("if(process.argv[2]==='--self-test')return selftest();","if(process.argv[2]==='--self-test')return selftestInstitutionalInputs(process.env.OFFROAD_REPOSITORY_ROOT!);");
 const modes="for(const mode of uiFixture?['success']as const:['success','compiler_failed','domain_blocked']as const)await run(mode);";
 if(!source.includes(modes))throw new Error('mode_contract_changed');source=source.replace(modes,"assert.equal(process.env.MATERIAL_UI_FIXTURE,undefined);await run('success');");
 source=source.replace("phase,code,...diagnostic}","phase,code,...diagnostic,...assessmentInstitutionalDiagnostic()}").replaceAll("eval:'material_native_sdk_http'","eval:'assessment_institutional_native_physical_sdk'");
 source='import {uploadInstitutionalInputs,approveInstitutionalInputs,captureInstitutionalAssessment,selftestInstitutionalInputs,assessmentInstitutionalDiagnostic} from "./assessment-institutional-native-sdk-eval";\n'+source;
 await mkdir(join(worker,'dist'),{recursive:true});temporary=await mkdtemp(join(worker,'dist','assessment-institutional-sdk-'));const entry=join(temporary,'eval.mjs');
 await build({stdin:{contents:source,resolveDir:join(worker,'scripts'),sourcefile:'assessment-institutional-current-sdk-harness.ts',loader:'ts'},outfile:entry,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent',plugins:[{name:'external-third-party',setup(b){b.onResolve({filter:/^[^.\/]/},async args=>{if(args.path.startsWith('@offroad/')||args.pluginData?.externalized)return null;const resolved=await b.resolve(args.path,{resolveDir:args.resolveDir,kind:args.kind,pluginData:{externalized:true}});if(resolved.errors.length)throw new Error('dependency_resolution_failed');return{path:resolved.path,external:true};});}}]});
 const code=await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[entry,...process.argv.slice(2)],{stdio:'inherit',env:{...process.env,OFFROAD_REPOSITORY_ROOT:fileURLToPath(new URL('../../',import.meta.url))}});child.once('error',reject);child.once('exit',code=>resolve(code??1));});process.exitCode=code;
}catch{process.stderr.write('assessment_institutional_native_sdk_launcher_failed\n');process.exitCode=1;}finally{if(temporary)await rm(temporary,{recursive:true,force:true});}
