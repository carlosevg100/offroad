import {describe,it,expect} from 'vitest';
import {buildTermSheet} from './termsheet';
import type {CapacityAssessment} from './capacity';
const capacity=(requested:string,recommended:string|null):CapacityAssessment=>({requested,recommended,bindingConstraint:'cash_flow',walls:[],calculations:[],gaps:[]});
describe('term-sheet requested amount bounded by capacity',()=>{
 it('keeps a 10m company ask when capacity is 60.096m',()=>{const sheet=buildTermSheet({archetypeId:'other',capacity:capacity('10000000','60096154')});const amount=sheet.terms.find(t=>t.id==='amount')!;expect(amount.value).toEqual({pt:'R$ 10.000.000',en:'R$ 10,000,000'});expect(amount.origin).toBe('requested');expect(amount.supportIds).toContain('capacity.constraint.cash_flow');expect(amount.divergence).toBeUndefined();});
 it('keeps a real lower ceiling and explains the restriction',()=>{const amount=buildTermSheet({archetypeId:'other',capacity:capacity('10000000','6000000')}).terms.find(t=>t.id==='amount')!;expect(amount.value.pt).toBe('R$ 6.000.000');expect(amount.origin).toBe('requested');expect(amount.rationale.pt).toContain('Pedido de R$ 10.000.000');expect(amount.divergence?.requested.pt).toBe('R$ 10.000.000');});
 it('does not invent a computed amount without a capacity assessment',()=>{const amount=buildTermSheet({archetypeId:'other',capacity:capacity('10000000',null)}).terms.find(t=>t.id==='amount')!;expect(amount.value).toEqual({pt:'a definir',en:'to be determined'});});
});
