import {
  composeDepthPacks,
  depthPackManifestSchema,
  type CompiledSpecializationProfile,
  type DepthPackManifest,
} from "@offroad/agent-contracts";
import {createHash} from "node:crypto";
import {dcmDepthPacks, institutionalHouseProcedureIdSet} from "@offroad/credit-playbook";
import {financialCalculationRegistry} from "@offroad/financial-core";
import {z} from "zod";

export const validatedDcmDepthPacks: readonly DepthPackManifest[] = dcmDepthPacks.map((candidate) =>
  depthPackManifestSchema.parse(candidate),
);
export const depthPackById: ReadonlyMap<string, DepthPackManifest> = new Map(validatedDcmDepthPacks.map((candidate) => [candidate.id, candidate]));

export const depthPackSelectionInputSchema = z.object({
  activationKeys: z.array(z.string().trim().min(2).max(160)).max(100).default([]),
  explicitPackIds: z.array(z.string().trim().min(3).max(120)).max(50).default([]),
}).strict();
export type DepthPackSelectionInput = z.input<typeof depthPackSelectionInputSchema>;

export type DepthPackSelection = {
  profile: CompiledSpecializationProfile;
  selectedPackIds: string[];
  unmatchedActivationKeys: string[];
};

function addWithDependencies(selected: Map<string, DepthPackManifest>, candidate: DepthPackManifest): void {
  for (const dependencyId of candidate.dependsOn) {
    const dependency = depthPackById.get(dependencyId);
    if (!dependency) throw new Error(`${candidate.id} references unknown dependency ${dependencyId}`);
    if (!selected.has(dependency.id)) addWithDependencies(selected, dependency);
  }
  selected.set(candidate.id, candidate);
}

/** Selects only explicitly activated packs plus dependencies; unknown needs remain visible. */
export function selectDepthPacks(rawInput: DepthPackSelectionInput): DepthPackSelection {
  const input = depthPackSelectionInputSchema.parse(rawInput);
  const selected = new Map<string, DepthPackManifest>();
  addWithDependencies(selected, depthPackById.get("core.institutional-dcm")!);
  for (const packId of input.explicitPackIds) {
    const candidate = depthPackById.get(packId);
    if (!candidate) throw new Error(`unknown depth pack ${packId}`);
    addWithDependencies(selected, candidate);
  }
  const matched = new Set<string>();
  for (const activationKey of input.activationKeys) {
    for (const candidate of validatedDcmDepthPacks) {
      if (candidate.activationKeys.includes(activationKey)) {
        matched.add(activationKey);
        addWithDependencies(selected, candidate);
      }
    }
  }
  const packs = [...selected.values()];
  return {
    profile: composeDepthPacks(packs),
    selectedPackIds: packs.map((candidate) => candidate.id).sort(),
    unmatchedActivationKeys: input.activationKeys.filter((key) => !matched.has(key)).sort(),
  };
}

const activationPatterns: readonly [string, RegExp][] = [
  ["objective:refinancing", /\b(refinanc|refi\b|rolagem|rollover|along|liability management|repric|reprecifica|venciment|maturity wall|d[ií]vida cara|expensive debt)\w*/iu],
  ["objective:liquidity", /\b(liquidez|liquidity|capital de giro|working capital|sazonal|seasonal|fornecedor|supplier finance|estoque|inventory)\b/iu],
  ["objective:capex", /\b(capex|expans[aã]o|expansion|nova planta|new plant|ramp[- ]?up|greenfield|equipamento|equipment)\b/iu],
  ["objective:acquisition", /\b(aquisi[cç][aã]o|acquisition|m&a|comprar (uma )?empresa|buyout|takeover)\b/iu],
  ["analysis:covenants", /\b(covenant|waiver|negative pledge|cross[- ]?default|headroom)\w*/iu],
  ["analysis:collateral", /\b(garantia|collateral|security package|alienação|cess[aã]o fiduci[aá]ria|lien|borrowing base)\b/iu],
  ["analysis:downside", /\b(downside|stress|estresse|sensibilidade|sensitivity|cen[aá]rio adverso|breakpoint)\b/iu],
  ["instrument:BR:debenture", /\b(deb[eê]nture|nota comercial)\b/iu],
  ["instrument:BR:fidc", /\b(fidc|direitos credit[oó]rios|cess[aã]o de receb[ií]veis)\b/iu],
  ["instrument:BR:ccb", /\b(ccb|c[eé]dula de cr[eé]dito banc[aá]rio)\b/iu],
  ["instrument:US:abl", /\b(abl|asset[- ]based (loan|lending)|borrowing base)\b/iu],
  ["instrument:US:private_credit", /\b(unitranche|direct lending|private credit)\b/iu],
  ["instrument:US:term_loan", /\b(term loan|revolver|revolving credit|syndicated loan)\b/iu],
  ["instrument:US:high_yield", /\b(high[- ]yield|144a|rule 144a|private placement|bond issuance)\b/iu],
  ["jurisdiction:BR", /\b(brasil|brazil|brl|cdi|cvm|anbima|b3)\b/iu],
  ["jurisdiction:US", /\b(estados unidos|united states|us|usa|usd|sofr|sec|ucc)\b/iu],
];

/** Conservative lexical activation. The Deal Captain may add keys, but unknown intent is never guessed. */
export function inferDepthPackActivationKeys(text: string): string[] {
  const normalized = text.normalize("NFKC");
  return activationPatterns.filter(([, pattern]) => pattern.test(normalized)).map(([key]) => key);
}

const taskByCoverageDomain: Readonly<Record<string, readonly string[]>> = {
  company_and_business_model: ["C01", "M01"],
  sector_and_competitive_position: ["C02"],
  historical_financials: ["C03"],
  earnings_quality: ["C04"],
  cash_conversion_and_working_capital: ["C06"],
  liquidity_and_debt_schedule: ["C05"],
  leverage_and_debt_service: ["C10"],
  covenants: ["S08"],
  collateral_and_security: ["S04"],
  receivables_inventory_or_contracts: ["C06", "S04"],
  business_plan_and_sources_uses: ["S09"],
  downside_and_sensitivities: ["C08"],
  legal_tax_and_regulatory: ["S03"],
  capital_alternatives: ["S02", "S05"],
  structure_and_terms: ["S05", "S08"],
  market_pricing_and_precedents: ["S06", "K04"],
  capital_provider_fit: ["K06"],
  execution_timeline_and_contingency: ["S10", "K09"],
  materials_and_cross_consistency: ["A10"],
};

/** Projects pack coverage into the existing immutable TaskSpec boundary. */
export function mapDepthRequirementsToTasks(profile: CompiledSpecializationProfile, taskIds: readonly string[]): Record<string, string[]> {
  const available = new Set(taskIds);
  const mapped: Record<string, string[]> = {};
  for (const requirement of profile.requirements) {
    const taskId = taskByCoverageDomain[requirement.domain]?.find((candidate) => available.has(candidate));
    if (!taskId) continue;
    mapped[taskId] = [...new Set([...(mapped[taskId] ?? []), requirement.key])].sort();
  }
  return mapped;
}

export type DepthPackRegistryAudit = {valid: boolean; errors: string[]};

/** Fails closed when a pack points to a procedure or deterministic calculation that does not exist. */
export function auditDepthPackRegistry(packs: readonly DepthPackManifest[] = validatedDcmDepthPacks): DepthPackRegistryAudit {
  const errors: string[] = [];
  const ids = new Set(packs.map((candidate) => candidate.id));
  if (ids.size !== packs.length) errors.push("duplicate depth pack id");
  for (const candidate of packs) {
    for (const procedureId of candidate.procedureIds) {
      if (!institutionalHouseProcedureIdSet.has(procedureId)) errors.push(`${candidate.id}: unknown procedure ${procedureId}`);
    }
    for (const calculationId of candidate.calculationIds) {
      if (!Object.hasOwn(financialCalculationRegistry, calculationId)) errors.push(`${candidate.id}: unknown calculation ${calculationId}`);
    }
    for (const dependency of candidate.dependsOn) {
      if (!ids.has(dependency)) errors.push(`${candidate.id}: unknown dependency ${dependency}`);
    }
  }
  return {valid: errors.length === 0, errors};
}

export const depthPackPromotionEvidenceSchema = z.object({
  packId: z.string().min(3),
  packVersion: z.string().min(3),
  unit: z.object({passed: z.boolean(), runId: z.string().min(1)}),
  integration: z.object({passed: z.boolean(), runId: z.string().min(1)}),
  goldCases: z.array(z.object({caseId: z.string().min(3), passed: z.boolean(), reportFingerprint: z.string().regex(/^[a-f0-9]{64}$/)})).min(2),
  adversarialCases: z.array(z.object({caseId: z.string().min(3), passed: z.boolean(), reportFingerprint: z.string().regex(/^[a-f0-9]{64}$/)})).min(1),
  generalistBenchmark: z.object({benchmarkId: z.string().min(3), passed: z.boolean(), runId: z.string().min(1), materialAdvantage: z.string().min(10)}),
  bilingualIdentityPassed: z.boolean(),
  expertReview: z.object({passed: z.boolean(), reviewer: z.string().min(3), reviewedAt: z.iso.datetime()}),
  legalReview: z.object({passed: z.boolean(), reviewer: z.string().min(3), reviewedAt: z.iso.datetime()}).optional(),
}).strict();
export type DepthPackPromotionEvidence = z.infer<typeof depthPackPromotionEvidenceSchema>;

export type DepthPackPromotionAssessment = {
  eligibleForProduction: boolean;
  packId: string;
  evidenceFingerprint: string;
  blockers: string[];
};

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/**
 * Automated tests alone never make a pack expert. Production requires two gold cases, an
 * adversarial case, an explicit win over the best generalist baseline and named expert review.
 */
export function assessDepthPackPromotion(rawPack: DepthPackManifest, rawEvidence: DepthPackPromotionEvidence): DepthPackPromotionAssessment {
  const candidate = depthPackManifestSchema.parse(rawPack);
  const evidence = depthPackPromotionEvidenceSchema.parse(rawEvidence);
  const blockers: string[] = [];
  if (candidate.maturity === "specified") blockers.push("pack is not implemented");
  if (evidence.packId !== candidate.id || evidence.packVersion !== candidate.version) blockers.push("evidence does not match exact pack version");
  if (!evidence.unit.passed) blockers.push("unit gate failed");
  if (!evidence.integration.passed) blockers.push("integration gate failed");
  if (evidence.goldCases.some((item) => !item.passed)) blockers.push("one or more gold cases failed");
  if (evidence.adversarialCases.some((item) => !item.passed)) blockers.push("one or more adversarial cases failed");
  if (!evidence.generalistBenchmark.passed) blockers.push("generalist benchmark did not show material advantage");
  if (!evidence.bilingualIdentityPassed) blockers.push("PT-BR/EN economic identity gate failed");
  if (!evidence.expertReview.passed) blockers.push("independent expert review failed");
  if (["instrument", "jurisdiction"].includes(candidate.dimension) && evidence.legalReview?.passed !== true) blockers.push("legal/regulatory review is missing or failed");
  const audit = auditDepthPackRegistry();
  if (!audit.valid) blockers.push(...audit.errors);
  return {
    eligibleForProduction: blockers.length === 0,
    packId: candidate.id,
    evidenceFingerprint: createHash("sha256").update(stableJson(evidence)).digest("hex"),
    blockers,
  };
}
