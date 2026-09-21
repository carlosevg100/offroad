import {createHash} from "node:crypto";
import {z} from "zod";
import {financialCoreVersion} from "@offroad/financial-core";
import {buildIndexedContractEvents, indexedContractEventsInputSchema} from "@offroad/financial-core/indexed-contract-events";
import {capitalContractPreparationInputSchema as legacyInput, capitalContractPreparationOutputSchema as legacyOutput, prepareCapitalContractEvidence} from "./capital-contract-preparation";

const key = z.string().trim().min(1).max(160);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const anchor = indexedContractEventsInputSchema.shape.opening.shape.anchor;
const numeric = z.string().regex(/^-?\d+(\.\d+)?(e[+-]?\d+)?$/);
const state = z.strictObject({date: z.iso.date(), principal: numeric, accruedInterest: numeric, accruedIndexation: numeric, appliedIndexLevel: numeric});
export const indexedContractResultSchema = z.strictObject({
  schemaVersion: z.literal("indexed-contract-events.v1"), calculationConvention: z.literal("explicit_discrete_accrual_grid"), currency: z.enum(["BRL", "USD"]),
  finalState: state, reports: z.array(state),
  payments: z.array(z.strictObject({id: key, date: z.iso.date(), principal: numeric, interest: numeric, indexation: numeric, interestRoundingAdjustment: numeric, indexationRoundingAdjustment: numeric})),
  trace: z.array(z.strictObject({date: z.iso.date(), kind: key, anchor, operands: z.record(z.string(), z.string()), result: state})),
  contractFingerprint: hash, fingerprint: hash, grantsExecution: z.literal(false), certifiesContractualCompliance: z.literal(false),
});
const identity = z.strictObject({instrumentId: key, seriesId: key});
const missingTerm = z.enum(["opening_state", "index_cycles", "accrual_calendar", "interest_terms", "event_order", "payment_events", "rounding", "indexation_treatment", "source_evidence"]);
const indexedEntry = z.discriminatedUnion("status", [
  identity.extend({status: z.literal("calculable"), input: indexedContractEventsInputSchema}),
  identity.extend({status: z.literal("insufficient_terms"), missingTerms: z.array(missingTerm).min(1), anchors: z.array(anchor).min(1)}),
]);
export const capitalContractPreparationV2InputSchema = z.strictObject({
  ...legacyInput.shape, schemaVersion: z.literal("capital-contract-preparation-input.v2"),
  inventory: z.array(identity.extend({kind: z.enum(["indexed", "non_indexed"]), anchor})).max(256),
  legacySeriesBindings: z.array(identity.extend({legacySeriesId: key})).max(256),
  indexedContracts: z.array(indexedEntry).max(256),
}).superRefine((i,c) => {
  if (Boolean(i.interest) !== Boolean(i.interestConventions)) c.addIssue({code: "custom", message: "Interest requires its explicit conventions"});
  if (!i.interest && !i.covenants && !i.inventory.length) c.addIssue({code: "custom", message: "Contract preparation needs a calculation or declared inventory"});
  if (i.interest?.series.some(s=>s.indexer === "IPCA")) c.addIssue({code: "custom", message: "capital_indexed_contract_explicit_terms_required: use indexedContracts, including insufficient_terms"});
  for (const p of ["document", "sourceVersionId"] as const) if (new Set(i.sources.map(s=>s[p])).size !== i.sources.length) c.addIssue({code: "custom", message: "Ambiguous source identity"});
  const observations=i.sources.flatMap(s=>s.observationIds);
  if (new Set(observations).size !== observations.length) c.addIssue({code:"custom",message:"Duplicate observation identity"});
});
const source = legacyInput.shape.sources.element;
export const capitalContractPreparationV2OutputSchema = z.strictObject({
  ...legacyOutput.shape, schemaVersion: z.literal("capital-contract-preparation.v2"),
  inputs: capitalContractPreparationV2InputSchema,
  sourceBindings: z.array(source.extend({path: key, locator: key.nullable()})),
  indexedContracts: z.array(identity.extend({status: z.enum(["calculated", "insufficient_terms"]), result: indexedContractResultSchema.nullable(), missingTerms: z.array(missingTerm)})),
  gaps: z.array(identity.extend({code: key})), coverage: z.literal("declared_inventory_only"),
});
const canonical = (value: unknown): string => JSON.stringify(value, (_k,v: unknown) => v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b,"en"))) : v);
const fingerprint=(x:unknown)=>createHash("sha256").update(canonical(x)).digest("hex");
export const capitalContractIdentityKey = (x: z.infer<typeof identity>) => JSON.stringify([x.instrumentId,x.seriesId]);

/** V2 has one indexed input. No legacy period is converted into an accrual or cash event. */
export function prepareCapitalContractEvidenceV2(raw: unknown) {
  const serialized=canonical(raw);
  if (Buffer.byteLength(serialized,"utf8")>1048576) throw new Error("capital_contract_input_too_large");
  const i=capitalContractPreparationV2InputSchema.parse(raw);
  if(serialized!==canonical(i)) throw new Error("capital_contract_explicit_terms_required");
  const byDocument=new Map(i.sources.map(s=>[s.document,s])); const byVersion=new Map(i.sources.map(s=>[s.sourceVersionId,s]));
  const used=new Set<string>(); const legacyUsed=new Set<string>();
  const bindings: z.infer<typeof capitalContractPreparationV2OutputSchema>["sourceBindings"]=[];
  function visit(value:unknown,path:string,legacy=false,depth=0) {
    if(depth>64) throw new Error("capital_contract_input_too_deep");
    if(Array.isArray(value)){value.forEach((v,n)=>visit(v,`${path}.${n}`,legacy,depth+1));return;}
    if(!value||typeof value!=="object")return;
    const o=value as Record<string,unknown>;
    const s=typeof o.document==="string"?byDocument.get(o.document):typeof o.locator==="string"?byVersion.get(String(o.sourceVersionId)):undefined;
    if(typeof o.document==="string"||typeof o.locator==="string") {
      if(!s)throw new Error("capital_contract_source_version_missing");
      used.add(s.document);if(legacy)legacyUsed.add(s.document);
      bindings.push({...s,path,locator:typeof o.locator==="string"?o.locator:null});
    }
    for(const [k,v]of Object.entries(o))visit(v,`${path}.${k}`,legacy,depth+1);
  }
  visit(i.interest,"interest",true);visit(i.interestConventions,"interestConventions",true);visit(i.covenants,"covenants",true);
  visit(i.inventory,"inventory");visit(i.indexedContracts,"indexedContracts");
  if(used.size!==i.sources.length)throw new Error("capital_contract_unused_source");
  const inventory=new Map(i.inventory.map(x=>[capitalContractIdentityKey(x),x]));
  if(inventory.size!==i.inventory.length)throw new Error("capital_contract_duplicate_identity");
  const covered=new Set<string>();
  const cover=(x:z.infer<typeof identity>,kind:"indexed"|"non_indexed")=>{
    const k=capitalContractIdentityKey(x);
    if(inventory.get(k)?.kind!==kind)throw new Error("capital_contract_inventory_mismatch");
    if(covered.has(k))throw new Error("capital_contract_duplicate_identity");
    covered.add(k);
  };
  const legacyIds=new Set<string>();
  for(const b of i.legacySeriesBindings){
    if(legacyIds.has(b.legacySeriesId)||!i.interest?.series.some(s=>s.id===b.legacySeriesId))throw new Error("capital_contract_series_binding_mismatch");
    legacyIds.add(b.legacySeriesId);cover(b,"non_indexed");
  }
  if(legacyIds.size!==(i.interest?.series.length??0))throw new Error("capital_contract_series_binding_missing");
  const indexedContracts=i.indexedContracts.map(x=>{
    cover(x,"indexed");
    if(x.status==="insufficient_terms")return {instrumentId:x.instrumentId,seriesId:x.seriesId,status:"insufficient_terms" as const,result:null,missingTerms:x.missingTerms};
    if(x.input.currency!==i.currency||x.input.opening.date!==i.asOf)throw new Error("capital_indexed_contract_context_mismatch");
    return {instrumentId:x.instrumentId,seriesId:x.seriesId,status:"calculated" as const,result:buildIndexedContractEvents(x.input),missingTerms:[]};
  });
  const gaps=i.inventory.filter(x=>!covered.has(capitalContractIdentityKey(x))).map(x=>({instrumentId:x.instrumentId,seriesId:x.seriesId,code:"contract_terms_missing"}));
  for(const x of indexedContracts)if(x.status==="insufficient_terms")for(const term of x.missingTerms)gaps.push({instrumentId:x.instrumentId,seriesId:x.seriesId,code:`contract_term_missing:${term}`});
  const legacy=i.interest||i.covenants?prepareCapitalContractEvidence({schemaVersion:"capital-contract-preparation-input.v1",workId:i.workId,purpose:i.purpose,entityId:i.entityId,perimeter:i.perimeter,scenario:i.scenario,currency:i.currency,asOf:i.asOf,
    sources:i.sources.filter(s=>legacyUsed.has(s.document)),interest:i.interest,interestConventions:i.interestConventions,covenants:i.covenants}):null;
  const payload={schemaVersion:"capital-contract-preparation.v2",financialCoreVersion,
    scope:{workId:i.workId,purpose:i.purpose,entityId:i.entityId,perimeter:i.perimeter,scenario:i.scenario,currency:i.currency,asOf:i.asOf},state:"candidate_contributions",inputs:i,inputFingerprint:fingerprint(i),
    interest:legacy?.interest??null,covenants:legacy?.covenants??null,indexedContracts,gaps,coverage:"declared_inventory_only",sourceBindings:bindings,
    sourceVersionIds:i.sources.map(s=>s.sourceVersionId),observationIds:i.sources.flatMap(s=>s.observationIds),
    requiredReviews:["source_extraction","contractual_applicability","rounding_and_calendar","waiver_cure_and_legal_effects","contextual_adoption"],
    mutatesWorkingBasis:false,certifiesContractualCompliance:false,grantsAccess:false,grantsExecution:false};
  return capitalContractPreparationV2OutputSchema.parse({...payload,fingerprint:fingerprint(payload)});
}
