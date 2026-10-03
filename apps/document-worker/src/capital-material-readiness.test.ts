import {describe,it,expect} from 'vitest';
import {materialInternalReadiness} from './capital-material-readiness';
import {buildMaterialCompilerReadyFixture} from './testing/material-compiler-ready-fixture';
// Exact compiler output is the positive policy evidence; negative cases below
// deliberately mutate a cloned DTO and cannot alter production authority.
const fixture=await buildMaterialCompilerReadyFixture({sessionId:'a9300000-0000-4000-8000-000000000001',runId:'a9300000-0000-4000-8000-000000000002'});
function policyDto(){const state=structuredClone(fixture.bundle.caseState);const product=structuredClone(fixture.bundle.materialPackage);const truth=product.materialTruth as {consistency:{status:string};exceptions:{id:string;severity:string}[]};truth.consistency.status='pass';truth.exceptions=truth.exceptions.filter(e=>e.id!=='cross-material-conflict');return {state,product,truth};}
describe('internal material preparation policy distinct from release',()=>{
 it('permits an internally valid package with exact canonical external gates still blocked',()=>{const {state,product}=policyDto();expect(fixture.result.state.redFlagTruth.mandate.externalOutputsAllowed).toBe(false);expect(materialInternalReadiness(state,product)).toBe(true);});
 it('denies financial inconsistency',()=>{const {state,product,truth}=policyDto();truth.consistency.status='blocked';truth.exceptions.push({id:'cross-material-conflict',severity:'critical'});expect(materialInternalReadiness(state,product)).toBe(false);});
 it('denies invented external prefix IDs',()=>{const {state,product,truth}=policyDto();truth.exceptions.push({id:'external-governance:made-up-critical',severity:'critical'});expect(materialInternalReadiness(state,product)).toBe(false);});
 it('denies a financial critical exception even with valid external blockers',()=>{const {state,product,truth}=policyDto();truth.exceptions.push({id:'financial-model-fingerprint-mismatch',severity:'critical'});expect(materialInternalReadiness(state,product)).toBe(false);});
 it('denies missing planned types',()=>{const {state,product}=policyDto();product.materials=(product.materials as {kind:string}[]).filter(m=>m.kind!=='term_sheet');expect(materialInternalReadiness(state,product)).toBe(false);});
 it('denies material blockers',()=>{const {state,product}=policyDto();state.materialsBlockedBy=['structure_unconfirmed'];expect(materialInternalReadiness(state,product)).toBe(false);});
 it('does not exempt externally blocked IDs without typed governance',()=>{const {state,product}=policyDto();delete state.materialProductionGovernance;expect(materialInternalReadiness(state,product)).toBe(false);});
 it('denies mutated canonical blocker lists',()=>{const {state,product}=policyDto();const g=state.materialProductionGovernance as {redFlags:{blockers:string[]}};g.redFlags.blockers=[];expect(materialInternalReadiness(state,product)).toBe(false);});
});
