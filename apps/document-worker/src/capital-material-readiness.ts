/** Internal preparation readiness is distinct from authorization to send a
 * package. Only the canonical RF/mandate discriminants may explain a critical
 * external gate; an arbitrary exception prefix is never accepted. */
import {redFlagTruthSetSchema} from '@offroad/case-understanding';
import {z} from 'zod';
const truthSchema=z.object({status:z.enum(['complete','partial','blocked']),consistency:z.object({status:z.enum(['pass','blocked'])}),exceptions:z.array(z.object({id:z.string(),severity:z.enum(['critical','high','medium','low','warning','info'])}).passthrough())}).passthrough();
export function materialInternalReadiness(state:Record<string,unknown>,product:Record<string,unknown>):boolean{
 if(!Array.isArray(state.materialsBlockedBy)||state.materialsBlockedBy.length||!Array.isArray(product.materials)||!product.materials.length||!product.financialModel||typeof product.financialModel!=='object'||!product.dataRoom||typeof product.dataRoom!=='object')return false;
 const kinds=new Set(product.materials.flatMap(m=>m&&typeof m==='object'&&'kind'in m?[m.kind]:[]));
 if(['teaser','financial_model','term_sheet','data_room_index'].some(k=>!kinds.has(k)))return false;
 const truth=truthSchema.safeParse(product.materialTruth);if(!truth.success||truth.data.consistency.status!=='pass')return false;
 const allowed=new Set<string>();
 const governance=state.materialProductionGovernance;
 if(governance&&typeof governance==='object'&&'redFlags'in governance){
  const flags=redFlagTruthSetSchema.safeParse(governance.redFlags);if(!flags.success)return false;
  const blockers=flags.data.findings.filter(f=>f.blocksExternalOutputs).map(f=>`red_flag:${f.flagId}:${f.status}`);
  if(flags.data.mandate.recommendation==='decline_review_required'&&flags.data.mandate.decision===null)blockers.push('mandate_decision:required');
  if(flags.data.mandate.decision?.decision==='decline')blockers.push('mandate_decision:declined');
  if(JSON.stringify([...new Set(blockers)].sort())!==JSON.stringify([...flags.data.blockers].sort()))return false;
  if(!flags.data.mandate.externalOutputsAllowed)for(const id of blockers)allowed.add(`external-governance:${id}`);
 }
 return truth.data.exceptions.filter(e=>e.severity==='critical').every(e=>allowed.has(e.id));
}
