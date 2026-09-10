import {z} from "zod";
import {fingerprintInstitutionalModelConfiguration, institutionalModelConfigurationSchema, institutionalReviewedSourceSchema} from "@offroad/financial-model";
import type {InstitutionalSetupContext} from "./institutional-setup-reader";
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const candidate = z.object({candidateId: z.uuid(), revision: z.number().int().positive(), status: z.enum(["review_required", "approved", "rejected"]), configurationFingerprint: hash, parentFingerprint: hash.nullable(), configuration: institutionalModelConfigurationSchema,
  answerEvidence: z.object({kind: z.literal("initial_configuration"), sourceManifestFingerprint: hash, submittedAt: z.iso.datetime({offset:true}), lineage:z.array(z.object({fieldPath:z.string(),periodEnd:z.string(),entityName:z.string(),sourceDocument:z.string(),sourceVersion:z.string(),sourceHash:hash,value:z.string().regex(/^-?\d+(?:\.\d+)?$/)})).min(1), sourceBindings: z.array(institutionalReviewedSourceSchema).min(1), review: z.object({status: z.enum(["blocked", "review_required", "ready_for_human_review"]), promotionEligible: z.literal(false), findings: z.array(z.object({id:z.string(),severity:z.enum(["blocker","warning","observation"]),period:z.string().optional(),message:z.string(),remediation:z.string()})), coverage:z.array(z.object({domain:z.string(),status:z.enum(["covered","partial","not_examined"]),evidence:z.array(z.string())}))})})});
export type InstitutionalSetupReview = Omit<z.infer<typeof candidate>, "configuration" | "answerEvidence"> & {
  canApprove: boolean; currency: string; periods: string[]; submittedAt:string;
  assumptions: z.infer<typeof institutionalModelConfigurationSchema>["assumptionBook"]["assumptions"];
  sources: Array<{id:string;name:string;version:string;asOfDate:string;currency:string;locator:string;rationale:string}>;
  findings:z.infer<typeof candidate>["answerEvidence"]["review"]["findings"];
  coverage:z.infer<typeof candidate>["answerEvidence"]["review"]["coverage"];
  historical: Array<{name:string;fieldPath:string;periodEnd:string;entityName:string;sourceName:string;value:string|null}>;
  debt:z.infer<typeof institutionalModelConfigurationSchema>["debtInstruments"];
  debtRateLineage:z.infer<typeof institutionalModelConfigurationSchema>["debtRateLineage"];
  capex:z.infer<typeof institutionalModelConfigurationSchema>["capex"];
  absence:z.infer<typeof institutionalModelConfigurationSchema>["absenceConfirmations"];
};
/** Only server-authorized, intact immutable candidates become actionable cards. */
export function parseInstitutionalSetupReviews(context: InstitutionalSetupContext): InstitutionalSetupReview[] {
  const approved = context.configurationReviews.flatMap(raw => {
    const head = z.object({revision:z.number().int().positive(),status:z.literal("approved"),configurationFingerprint:hash,configuration:institutionalModelConfigurationSchema}).safeParse(raw);
    return head.success && fingerprintInstitutionalModelConfiguration(head.data.configuration) === head.data.configurationFingerprint ? [head.data] : [];
  }).sort((a,b)=>b.revision-a.revision)[0];
  const ids = context.configurationReviews.flatMap(raw => {const parsed=z.object({candidateId:z.string()}).safeParse(raw);return parsed.success?[parsed.data.candidateId]:[];});
  if(new Set(ids).size!==ids.length)return [];
  const invalidApproved = context.configurationReviews.some(raw=>typeof raw==="object"&&raw!==null&&"status" in raw&&raw.status==="approved")&&!approved;
  const seen = new Set<string>();
  return context.configurationReviews.flatMap(raw => {
    const parsed = candidate.safeParse(raw); if (!parsed.success) return [];
    const c = parsed.data; if (seen.has(c.candidateId)) return []; seen.add(c.candidateId);
    if (fingerprintInstitutionalModelConfiguration(c.configuration) !== c.configurationFingerprint) return [];
    const config = c.configuration, e = c.answerEvidence;
    const sourceName = (id:string) => context.currentSources.find(s=>s.sourceDocument===id)?.originalName ?? id;
    const current = e.sourceManifestFingerprint === context.sourceManifestFingerprint && e.sourceBindings.every(binding=>context.currentSources.some(s=>s.sourceDocument===binding.sourceDocument && s.version===binding.version && s.hash===binding.hash && s.hashVerified));
    const historical = [...Object.entries(config.openingBalanceSheet.bindings), ...config.revenueSegments.map(s=>["baseRevenue",s.baseRevenue] as const), ["taxLossCarryforward",config.taxes.openingTaxLossCarryforward] as const,["disallowedInterestCarryforward",config.taxes.openingDisallowedInterestCarryforward] as const].map(([name,binding])=>({name,fieldPath:binding.fieldPath,periodEnd:binding.periodEnd,entityName:binding.entityName,sourceName:sourceName(binding.sourceDocument),value:e.lineage.find(l=>l.fieldPath===binding.fieldPath&&l.periodEnd===binding.periodEnd&&l.entityName===binding.entityName&&l.sourceDocument===binding.sourceDocument&&l.sourceVersion===binding.sourceVersion&&l.sourceHash===binding.sourceHash)?.value??null}));
    return [{candidateId:c.candidateId,revision:c.revision,status:c.status,configurationFingerprint:c.configurationFingerprint,parentFingerprint:c.parentFingerprint,
      canApprove:c.status==="review_required" && !invalidApproved && current && (approved?.configurationFingerprint ?? null)===c.parentFingerprint && historical.every(h=>h.value!==null) && config.assumptionBook.assumptions.every(a=>config.assumptionBook.periods.every(p=>a.values[p]!==undefined)) && e.review.status!=="blocked" && !e.review.findings.some(f=>f.severity==="blocker"),currency:config.currency,periods:config.assumptionBook.periods,submittedAt:e.submittedAt,assumptions:config.assumptionBook.assumptions,
      sources:e.sourceBindings.map(s=>({id:s.sourceDocument,name:sourceName(s.sourceDocument),version:s.version,asOfDate:s.asOfDate,currency:s.currency,locator:s.metadataEvidence.locator,rationale:s.metadataEvidence.rationale})),findings:e.review.findings,coverage:e.review.coverage,historical,debt:config.debtInstruments,debtRateLineage:config.debtRateLineage,capex:config.capex,absence:config.absenceConfirmations}];
  });
}
