import {createHash} from "node:crypto";
import {z} from "zod";
import Decimal from "decimal.js";
import {
  adherenceSubjects,
  classifyCandidate,
  candidateFitVersion,
  type CandidateCriterion,
} from "@offroad/matching-core";
import {assessMandateFit, type CriterionId, type DealRequest} from "./fit";
import {resolveMandate, instrumentSchema, collateralKindSchema} from "./mandate";
import {buildMarketTruthSet} from "./market-truth";
import {mandateProvenanceSchema, resolveCriterion} from "./provenance";
import {verifiedMandateRecordSchema} from "./verified-mandate";

const decimal = z.string().regex(/^(0|[1-9][0-9]{0,29})(\.[0-9]{1,18})?$/);
const timestamp = z.iso.datetime({offset: true});
const sha = z.string().regex(/^[a-f0-9]{64}$/);
export const providerCaseCriteriaSchema = z.object({
  schemaVersion: z.literal("provider-case-criteria.v1"), asOf: timestamp,
  mandateMaxAgeMonths: z.number().int().min(1).max(120).optional(),
  currency: z.enum(["BRL", "USD", "EUR"]), amount: decimal.optional(), termMonths: z.number().int().positive().max(1200).optional(),
  sector: z.string().trim().min(1).max(200).optional(), geography: z.string().trim().min(1).max(200).optional(),
  instruments: z.array(instrumentSchema).min(1).max(10).optional(), collateral: z.array(collateralKindSchema).min(1).max(9).optional(),
  leverage: decimal.optional(), dscr: decimal.optional(),
  source: z.object({kind: z.literal("user_confirmed"), referenceId: z.uuid()}).strict(),
}).strict();
export type ProviderCaseCriteria = z.infer<typeof providerCaseCriteriaSchema>;
const sourced = <T extends z.ZodType>(value: T) => z.object({value, provenance: mandateProvenanceSchema, observedAt: timestamp, note: z.string().min(1).max(1000)}).strict();
const moneyRange = z.object({min: decimal, max: decimal}).strict();
const monthRange = z.object({min: z.number().int().nonnegative(), max: z.number().int().positive()}).strict();
export const caseFitProviderSchema = z.object({
  providerId: z.string().min(1).max(200), name: z.string().min(1).max(500), ownerOrganizationId: z.uuid(), sourceClass: z.enum(["directory", "registered"]),
  mandate: z.object({
    ticket: z.array(sourced(moneyRange)), termMonths: z.array(sourced(monthRange)), sectors: z.array(sourced(z.array(z.string().min(1)).min(1))),
    instruments: z.array(sourced(z.array(instrumentSchema).min(1))), collateral: z.array(sourced(z.array(collateralKindSchema).min(1))),
    geographies: z.array(sourced(z.array(z.string().min(1)).min(1))), leverageCeiling: z.array(sourced(decimal)), minimumDscr: z.array(sourced(decimal)),
    active: z.array(sourced(z.boolean())), currencies: z.array(sourced(z.array(z.enum(["BRL", "USD", "EUR"])).min(1))),
  }).strict(),
  /** The verified mandate record this provider was projected from, when it has one. */
  mandateRecord: verifiedMandateRecordSchema.optional(),
}).strict();
const bilingual = z.object({pt: z.string(), en: z.string()}).strict();
const criterion = z.object({id: z.string(), labels: bilingual, outcome: z.enum(["fits", "excluded", "unknown", "not_assessed"]), hard: z.boolean(), mandate: z.string().nullable(), request: z.string().nullable(), explanation: bilingual, divergent: z.boolean(), resolvedBy: z.string().nullable(), evidence: z.array(z.object({value: z.unknown(), provenance: mandateProvenanceSchema, observedAt: timestamp, note: z.string()}).strict())}).strict();
/**
 * The classification a reader acts on, persisted beside the criteria it was derived from.
 *
 * The fields are optional so a result produced before this contract still verifies against its
 * own fingerprint: an artifact that was honest when it was written does not become unreadable
 * because the vocabulary grew.
 */
const adherenceItem = z.object({
  subject: z.enum(adherenceSubjects as unknown as [string, ...string[]]),
  outcome: z.enum(["fits", "excluded", "unknown", "not_assessed"]),
  mandate: z.string().nullable(), request: z.string().nullable(),
  origin: mandateProvenanceSchema.nullable(), observedAt: z.string().nullable(),
}).strict();
const candidateFitSchema = z.object({
  version: z.literal(candidateFitVersion),
  evidenceSource: z.enum(["confirmed_mandate", "historical_activity", "public_record"]),
  classification: z.enum(["eligible", "hypothesis", "excluded"]),
  incompatibilities: z.array(z.string()), unverified: z.array(z.string()), openQuestions: z.array(z.string()),
  adherence: z.array(adherenceItem).length(adherenceSubjects.length),
  mandateVersion: z.number().int().positive().nullable(),
  mandateStatus: z.enum(["draft", "confirmed", "expired", "withdrawn"]).nullable(),
  confirmedAt: z.string().nullable(),
}).strict();
const payloadSchema = z.object({
  schemaVersion: z.literal("provider-case-fit.v1"), scope: z.literal("research_case_fit"), organizationId: z.uuid(), projectId: z.uuid(), planId: z.uuid(), planFingerprint: sha,
  asOf: timestamp, caseCriteria: providerCaseCriteriaSchema, caseFingerprint: sha, sourceFingerprint: sha,
  candidates: z.array(z.object({providerId: z.string(), providerName: z.string(), sourceClass: z.enum(["directory", "registered"]), order: z.number().int().positive(),
    verdict: z.enum(["fits", "possible", "excluded"]), reviewReadiness: z.enum(["ready_for_review", "requires_confirmation", "excluded"]), mandateFingerprint: sha,
    criteria: z.array(criterion), blockers: z.array(z.string()), companyGaps: z.array(z.string()), mandateGaps: z.array(z.string()), rankBasis: z.object({governed: z.boolean(), unresolved: z.number().int(), oldestHardCriterionMonths: z.number().nullable()}).strict(),
    fit: candidateFitSchema.optional(), mandateRecord: verifiedMandateRecordSchema.nullable().optional(),
  }).strict()).max(500),
  structuralExclusions: z.array(z.string()), shortlistAuthorized: z.literal(false), externalEffectAllowed: z.literal(false),
}).strict();
export const providerCaseFitArtifactSchema = payloadSchema.extend({fingerprint: sha}).strict();
export type ProviderCaseFitArtifact = z.infer<typeof providerCaseFitArtifactSchema>;
const stable = (value: unknown): string => Array.isArray(value) ? `[${value.map(stable).join(",")}]` : value !== null && typeof value === "object" ? `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${stable(v)}`).join(",")}}` : JSON.stringify(value);
export const providerCaseFitFingerprint = (value: unknown) => createHash("sha256").update(stable(value)).digest("hex");
const fieldByCriterion = {active: "active", instrument: "instruments", ticket: "ticket", term: "termMonths", sector: "sectors", geography: "geographies", collateral: "collateral", leverage: "leverageCeiling", dscr: "minimumDscr"} as const;

/** Deterministic, scoped research screening. Review readiness never grants disclosure or contact. */
export function buildProviderCaseFit(input: {organizationId: string; projectId: string; planId: string; planFingerprint: string; criteria: unknown; providers: unknown; mandateMaxAgeMonths: number | null}) : ProviderCaseFitArtifact {
  const request = providerCaseCriteriaSchema.parse(input.criteria);
  const providers = z.array(caseFitProviderSchema).max(500).parse(input.providers);
  if (input.mandateMaxAgeMonths !== null && (!Number.isFinite(input.mandateMaxAgeMonths) || input.mandateMaxAgeMonths < 0)) throw new Error("case_fit_freshness_policy_invalid");
  if (providers.some(p => p.ownerOrganizationId !== input.organizationId) || new Set(providers.map(p => p.providerId)).size !== providers.length) throw new Error("case_fit_provider_scope_invalid");
  providers.sort((a,b) => a.providerId < b.providerId ? -1 : a.providerId > b.providerId ? 1 : 0);
  for (const provider of providers) for (const observations of Object.values(provider.mandate)) observations.sort((a,b) => stable(a) < stable(b) ? -1 : stable(a) > stable(b) ? 1 : 0);
  const sourceFingerprint = providerCaseFitFingerprint(providers);
  const caseFingerprint = providerCaseFitFingerprint(request);
  const candidates = providers.map(provider => {
    // Future evidence and directory identity never become current mandate assertions.
    const applicable = Object.fromEntries(Object.entries(provider.mandate).map(([key, values]) => [key, provider.sourceClass === "directory" ? [] : values.filter(v => Date.parse(v.observedAt) <= Date.parse(request.asOf))]));
    // A directory identity carries no verified record, and a record confirmed after the approved
    // date is not evidence about that date.
    const mandateRecord = provider.sourceClass === "directory" || !provider.mandateRecord
      || (provider.mandateRecord.confirmedAt !== null && Date.parse(provider.mandateRecord.confirmedAt) > Date.parse(request.asOf))
      ? null : provider.mandateRecord;
    const parsed = caseFitProviderSchema.shape.mandate.parse(applicable);
    for (const range of parsed.ticket) if (new Decimal(range.value.min).gt(range.value.max)) throw new Error("case_fit_ticket_range_invalid");
    for (const range of parsed.termMonths) if (range.value.min > range.value.max) throw new Error("case_fit_term_range_invalid");
    const mandate = resolveMandate({...parsed, fundId: provider.providerId, fundName: provider.name}, {asOf: request.asOf});
    const fit = assessMandateFit(mandate, request as DealRequest);
    const truth = buildMarketTruthSet({mandates:[mandate], fits:[fit], structuralExclusions:[], mandateMaxAgeMonths: input.mandateMaxAgeMonths, waveLimit:null, caseFingerprint, materialGate:{releaseDecision:"internal_only",fingerprint:null,recipientIds:[]}}).shortlist[0]!;
    const currency = resolveCriterion(parsed.currencies, {asOf:request.asOf});
    const currencyOutcome = !currency ? "not_assessed" : currency.value.includes(request.currency) ? "fits" : "excluded";
    const criteria = fit.criteria.map(c => ({...c, mandate:c.mandate?.replaceAll("R$ ", "") ?? null, request:c.request?.replaceAll("R$ ", `${request.currency} `) ?? null, resolvedBy:c.resolvedBy ?? null, evidence: parsed[fieldByCriterion[c.id]]}));
    const currencyCriterion = {id:"currency",labels:{pt:"Moeda",en:"Currency"},outcome:currencyOutcome,hard:true,mandate:currency?.value.join(", ") ?? null,request:request.currency,explanation:{pt:!currency?"Moeda do mandato não confirmada.":currencyOutcome==="fits"?"Moeda dentro do mandato.":"Moeda fora do mandato.",en:!currency?"Mandate currency is unconfirmed.":currencyOutcome==="fits"?"Currency is within the mandate.":"Currency is outside the mandate."},divergent:currency?.divergent ?? false,resolvedBy:null,evidence:parsed.currencies} as const;
    const blockers = [...truth.blockers, ...(!currency ? ["mandate_missing:currency"] : (input.mandateMaxAgeMonths === null || currency.ageMonths > input.mandateMaxAgeMonths) ? ["mandate_stale:currency"] : []), ...((currency?.accepted.provenance === "inferred" || currency?.accepted.provenance === "observed") ? ["mandate_unconfirmed:currency"] : [])];
    for(const c of fit.criteria.filter(c=>c.hard)) {
      const accepted = mandate[fieldByCriterion[c.id]]?.accepted;
      if(accepted?.provenance === "observed")blockers.push(`mandate_unconfirmed:${c.id}`);
    }
    // Conflicting statements at equal priority are unresolved, even if the legacy resolver selects one.
    for (const [key, observations] of Object.entries(parsed)) if (observations.some((a,i) => observations.some((b,j) => i < j && a.provenance === b.provenance && a.observedAt === b.observedAt && stable(a.value) !== stable(b.value)))) blockers.push(`mandate_conflicting:${key}`);
    const ticketCurrencyConfirmed = currency?.value.length === 1 && currency.value[0] === request.currency && !blockers.some(b=>b.endsWith(":currency"));
    if (!ticketCurrencyConfirmed) blockers.push("mandate_ticket_currency_unconfirmed");
    const allCriteria = [...criteria,currencyCriterion].map(c => {
      if(c.id === "ticket" && !ticketCurrencyConfirmed)return {...c,outcome:"not_assessed" as const,explanation:{pt:"A moeda da faixa de investimento não está confirmada para esta operação. Não foi aplicada conversão cambial.",en:"The investment range currency is not confirmed for this transaction. No currency conversion was applied."}};
      const field = c.id === "currency" ? "currencies" : fieldByCriterion[c.id as CriterionId];
      const untrusted = blockers.some(b => b === `mandate_stale:${c.id}` || b === `mandate_unconfirmed:${c.id}` || b === `mandate_conflicting:${field}`);
      return untrusted ? {...c,outcome:"not_assessed" as const,explanation:{pt:"A fonte requer confirmação ou atualização; este critério não determina inclusão ou exclusão.",en:"The source needs confirmation or refresh; this criterion does not determine inclusion or exclusion."}} : c;
    });
    const verdict: "fits" | "possible" | "excluded" = allCriteria.some(c=>c.hard&&c.outcome==="excluded") ? "excluded" : allCriteria.some(c=>c.outcome==="unknown"||c.outcome==="not_assessed") ? "possible" : "fits";
    const governed = blockers.length === 0 && verdict !== "excluded";
    const hardAges = Object.entries(mandate).filter(([key]) => Object.values(fieldByCriterion).includes(key as typeof fieldByCriterion[CriterionId]) && key !== "collateral").map(([,value]) => value && typeof value === "object" && "ageMonths" in value ? value.ageMonths as number : null).filter((age):age is number => age !== null);
    const acceptedFor = (id: string) => id === "currency" ? currency?.accepted ?? null : mandate[fieldByCriterion[id as CriterionId]]?.accepted ?? null;
    const classificationInput: CandidateCriterion[] = allCriteria.map(c => {
      const accepted = acceptedFor(c.id);
      return {id: c.id, hard: c.hard, outcome: c.outcome, mandate: c.mandate, request: c.request,
        origin: accepted?.provenance ?? null, observedAt: accepted?.observedAt ?? null};
    });
    const candidateFit = classifyCandidate({criteria: classificationInput, record: mandateRecord, sourceClass: provider.sourceClass});
    return {providerId:provider.providerId,providerName:provider.name,sourceClass:provider.sourceClass,order:1,verdict,reviewReadiness:verdict==="excluded"?"excluded":governed?"ready_for_review":"requires_confirmation",mandateFingerprint:providerCaseFitFingerprint(provider.mandate),fit:candidateFit,mandateRecord,criteria:allCriteria,blockers:[...new Set(blockers)].sort(),companyGaps:allCriteria.filter(c=>c.outcome==="unknown").map(c=>c.id),mandateGaps:allCriteria.filter(c=>c.outcome==="not_assessed").map(c=>c.id),rankBasis:{governed,unresolved:allCriteria.filter(c=>c.outcome==="unknown"||c.outcome==="not_assessed").length,oldestHardCriterionMonths:hardAges.length?Math.max(...hardAges,...(currency?[currency.ageMonths]:[])):null}};
  });
  const verdictOrder = {fits:0,possible:1,excluded:2};
  candidates.sort((a,b) => Number(b.rankBasis.governed)-Number(a.rankBasis.governed) || verdictOrder[a.verdict]-verdictOrder[b.verdict] || a.rankBasis.unresolved-b.rankBasis.unresolved || (a.rankBasis.oldestHardCriterionMonths??Infinity)-(b.rankBasis.oldestHardCriterionMonths??Infinity) || (a.providerId < b.providerId ? -1 : a.providerId > b.providerId ? 1 : 0));
  const structuralExclusions = candidates.length ? candidates[0]!.criteria.filter(c=>c.hard&&c.outcome==="excluded"&&candidates.every(p=>p.criteria.some(other=>other.id===c.id&&other.hard&&other.outcome==="excluded"))).map(c=>c.id) : [];
  const payload = payloadSchema.parse({schemaVersion:"provider-case-fit.v1",scope:"research_case_fit",organizationId:input.organizationId,projectId:input.projectId,planId:input.planId,planFingerprint:input.planFingerprint,asOf:request.asOf,caseCriteria:request,caseFingerprint,sourceFingerprint,candidates:candidates.map((c,index)=>({...c,order:index+1})),structuralExclusions,shortlistAuthorized:false,externalEffectAllowed:false});
  return {...payload,fingerprint:providerCaseFitFingerprint(payload)};
}
export function readProviderCaseFitArtifact(value:unknown,binding:{organizationId:string;projectId:string;planId:string;planFingerprint:string}):ProviderCaseFitArtifact|null {
  const parsed=providerCaseFitArtifactSchema.safeParse(value); if(!parsed.success)return null;
  const {fingerprint,...payload}=parsed.data;
  if(Object.entries(binding).some(([key,value])=>payload[key as keyof typeof binding]!==value)||providerCaseFitFingerprint(payload)!==fingerprint||providerCaseFitFingerprint(payload.caseCriteria)!==payload.caseFingerprint)return null;
  return parsed.data;
}
