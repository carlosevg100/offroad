import {describe,expect,it} from "vitest";
import {buildProviderCaseFit} from "@offroad/fund-mandate";
import {currentProviderCaseFit} from "./provider-case-fit-reader";
const id="10000000-0000-4000-8000-000000000001";
const binding={organizationId:id,projectId:id,planId:id,planFingerprint:'a'.repeat(64)};
const content=buildProviderCaseFit({...binding,criteria:{schemaVersion:'provider-case-criteria.v1',asOf:'2026-09-10T00:00:00Z',currency:'BRL',source:{kind:'user_confirmed',referenceId:id}},providers:[],mandateMaxAgeMonths:null});
const row={id:'artifact',artifact_type:'provider_case_fit',schema_version:'provider-case-fit.v1',artifact_version:1,status:'draft',plan_id:id,task_run_id:'run',content};const runs=[{id:'run',status:'succeeded'}];
describe('currentProviderCaseFit',()=>{
 it('accepts only completed current-plan scoped output',()=>{expect(currentProviderCaseFit([row],runs,binding)?.fit).toEqual(content);expect(currentProviderCaseFit([row],[{id:'run',status:'running'}],binding)).toBeNull();expect(currentProviderCaseFit([row],runs,{...binding,organizationId:'other'})).toBeNull();});
 it('rejects tampering or stale newest version without resurrecting prior output',()=>{expect(currentProviderCaseFit([{...row,content:{...content,externalEffectAllowed:true}}],runs,binding)).toBeNull();expect(currentProviderCaseFit([row,{...row,artifact_version:2,status:'stale'}],runs,binding)).toBeNull();});
});
