import {readFileSync} from 'node:fs';
import {describe,expect,it} from 'vitest';
import {providerCaseFitPlanSnapshot,compileProviderCaseFitBrief} from './provider-research-plan';
describe('provider case fit plan',()=>{
 it('preserves the exact admitted v14 snapshot independently of other registry releases',()=>{
  const fixture=readFileSync(new URL('../../../supabase/tests/support/provider_case_fit_plan_snapshot.sql',import.meta.url),'utf8');
  const expected=JSON.parse(fixture.split('$snapshot$')[1]!);
  expect(providerCaseFitPlanSnapshot()).toEqual(expected);
 });
 it('preserves original entry identity and does not add distribution authority',()=>{
  const plan=providerCaseFitPlanSnapshot('origination_thesis');expect(plan.job.id).toBe('origination_thesis');expect(plan.taskSpecs.map(t=>t.id)).toEqual(['M01','K01','K02']);
  expect(()=>compileProviderCaseFitBrief({plan,locale:'pt-BR',objective:'Selecionar financiadores para o caso.',revisionContext:'test'})).not.toThrow();
  expect(()=>compileProviderCaseFitBrief({plan:{...plan,job:{...plan.job,targetTaskIds:['K04']}},locale:'pt-BR',objective:'Selecionar financiadores.',revisionContext:'test'})).toThrow();
 });
});
