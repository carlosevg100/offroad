import {z} from "zod";

/**
 * Language and jurisdiction are independent dimensions.
 *
 * A project may be operated in Portuguese while analysing US debt, or compiled in English from
 * Brazilian source documents. Evidence always preserves its original language; translations are
 * attributed projections and never replace the source. Cross-border concept bridges state the
 * quality of the relationship instead of pretending that two legal instruments are identical.
 */
export const advisorLocaleSchema = z.enum(["pt-BR", "en-US"]);
export type AdvisorLocale = z.infer<typeof advisorLocaleSchema>;

export const debtJurisdictionSchema = z.enum(["BR", "US"]);
export type DebtJurisdiction = z.infer<typeof debtJurisdictionSchema>;

export const sourceLanguageSchema = z.enum(["pt-BR", "en-US", "mixed", "other"]);
export type SourceLanguage = z.infer<typeof sourceLanguageSchema>;

export const outputLanguageModeSchema = z.enum(["pt-BR", "en-US", "bilingual"]);
export type OutputLanguageMode = z.infer<typeof outputLanguageModeSchema>;

export const accountingFrameworkSchema = z.enum([
  "br_gaap_cpc_ifrs",
  "ifrs",
  "us_gaap",
  "other",
  "unknown",
]);
export type AccountingFramework = z.infer<typeof accountingFrameworkSchema>;

export const debtJurisdictionProfileSchema = z.object({
  primary: debtJurisdictionSchema,
  relevant: z.array(debtJurisdictionSchema).min(1).max(2),
  crossBorder: z.boolean(),
  reportingFrameworks: z.array(accountingFrameworkSchema).min(1).max(4),
  currencies: z.array(z.enum(["BRL", "USD", "other"])).min(1).max(3),
}).superRefine((value, context) => {
  if (new Set(value.relevant).size !== value.relevant.length) {
    context.addIssue({code: "custom", path: ["relevant"], message: "relevant jurisdictions must be unique"});
  }
  if (!value.relevant.includes(value.primary)) {
    context.addIssue({code: "custom", path: ["relevant"], message: "primary jurisdiction must be relevant"});
  }
  if (value.crossBorder !== (value.relevant.length > 1)) {
    context.addIssue({code: "custom", path: ["crossBorder"], message: "crossBorder must reflect the jurisdiction set"});
  }
});
export type DebtJurisdictionProfile = z.infer<typeof debtJurisdictionProfileSchema>;

export const advisorLanguagePolicySchema = z.object({
  workingLocale: advisorLocaleSchema,
  sourceLanguages: z.array(sourceLanguageSchema).min(1).max(4),
  outputMode: outputLanguageModeSchema,
  allowLanguageSwitch: z.literal(true),
  preserveOriginalEvidence: z.literal(true),
  instantWorkingTranslation: z.literal(true),
  reviewedExternalMaterials: z.literal(true),
});
export type AdvisorLanguagePolicy = z.infer<typeof advisorLanguagePolicySchema>;

export const evidenceTranslationSchema = z.object({
  locale: advisorLocaleSchema,
  text: z.string().trim().min(1).max(20_000),
  status: z.enum(["machine_draft", "reviewed", "approved"]),
  modelOrReviewer: z.string().trim().min(1).max(240),
  sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
});

export const localizedEvidenceTextSchema = z.object({
  sourceText: z.string().trim().min(1).max(20_000),
  sourceLanguage: sourceLanguageSchema,
  sourceRef: z.string().trim().min(1).max(500),
  sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  translations: z.array(evidenceTranslationSchema).max(2).default([]),
}).superRefine((value, context) => {
  const locales = new Set<string>();
  value.translations.forEach((translation, index) => {
    if (translation.sourceFingerprint !== value.sourceFingerprint) {
      context.addIssue({code: "custom", path: ["translations", index, "sourceFingerprint"], message: "translation must point to the original evidence fingerprint"});
    }
    if (locales.has(translation.locale)) {
      context.addIssue({code: "custom", path: ["translations", index, "locale"], message: "translation locale must be unique"});
    }
    locales.add(translation.locale);
  });
});
export type LocalizedEvidenceText = z.infer<typeof localizedEvidenceTextSchema>;

export const jurisdictionConceptBridgeSchema = z.object({
  canonicalConceptId: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  fromJurisdiction: debtJurisdictionSchema,
  fromTerm: z.string().trim().min(1).max(240),
  toJurisdiction: debtJurisdictionSchema,
  toTerm: z.string().trim().min(1).max(240).nullable(),
  relationship: z.enum(["exact", "functional", "partial", "no_direct_equivalent"]),
  caveats: z.array(z.string().trim().min(1).max(1_000)).min(1).max(12),
  asOfDate: z.iso.date(),
  sourceRefs: z.array(z.string().trim().min(1).max(500)).min(1).max(20),
}).superRefine((value, context) => {
  if (value.fromJurisdiction === value.toJurisdiction) {
    context.addIssue({code: "custom", path: ["toJurisdiction"], message: "a bridge must cross jurisdictions"});
  }
  if (value.relationship === "no_direct_equivalent" && value.toTerm !== null) {
    context.addIssue({code: "custom", path: ["toTerm"], message: "no direct equivalent cannot name an equivalent term"});
  }
  if (value.relationship !== "no_direct_equivalent" && value.toTerm === null) {
    context.addIssue({code: "custom", path: ["toTerm"], message: "mapped relationships require a target term"});
  }
});
export type JurisdictionConceptBridge = z.infer<typeof jurisdictionConceptBridgeSchema>;

export const debtKnowledgeLayerSchema = z.enum([
  "universal_debt_core",
  "br_debt",
  "us_debt",
  "br_us_bridge",
  "sector",
  "instrument",
  "market_current",
]);

export const debtKnowledgePackRequirementSchema = z.object({
  id: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  layer: debtKnowledgeLayerSchema,
  jurisdictions: z.array(debtJurisdictionSchema).max(2),
  supportedLocales: z.array(advisorLocaleSchema).min(2).max(2),
  responsibilities: z.array(z.string().trim().min(3).max(500)).min(1).max(20),
  requiresDatedSources: z.boolean(),
});
export type DebtKnowledgePackRequirement = z.infer<typeof debtKnowledgePackRequirementSchema>;

export const debtKnowledgeFreshnessSchema = z.enum([
  "foundational",
  "accounting",
  "regulatory",
  "market_terms",
  "transaction_comparable",
  "lender_mandate",
]);
export type DebtKnowledgeFreshness = z.infer<typeof debtKnowledgeFreshnessSchema>;

export const debtKnowledgeAccessSchema = z.enum([
  "public",
  "house_private",
  "organization_private",
  "project_private",
]);
export type DebtKnowledgeAccess = z.infer<typeof debtKnowledgeAccessSchema>;

export const debtKnowledgeRecordSchema = z.object({
  id: z.string().regex(/^[a-z0-9_.-]{3,160}$/),
  canonicalConceptId: z.string().regex(/^[a-z0-9_.-]{3,120}$/),
  layer: debtKnowledgeLayerSchema,
  jurisdictions: z.array(debtJurisdictionSchema).max(2),
  language: sourceLanguageSchema,
  title: z.string().trim().min(3).max(500),
  content: z.string().trim().min(3).max(100_000),
  source: z.object({
    ref: z.string().trim().min(1).max(1_000),
    publisher: z.string().trim().min(1).max(500),
    type: z.enum([
      "law_or_regulation",
      "accounting_standard",
      "company_filing",
      "transaction_document",
      "market_data",
      "authoritative_reference",
      "house_observation",
    ]),
    publishedAt: z.iso.datetime().optional(),
    effectiveFrom: z.iso.date().optional(),
    retrievedAt: z.iso.datetime(),
  }),
  asOfDate: z.iso.date(),
  validUntil: z.iso.date().optional(),
  freshness: debtKnowledgeFreshnessSchema,
  version: z.string().trim().min(1).max(120),
  status: z.enum(["draft", "reviewed", "approved", "deprecated"]),
  access: debtKnowledgeAccessSchema,
  reuseScope: z.enum(["global", "organization", "project"]),
  sourceFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  reviewedAt: z.iso.datetime().optional(),
}).superRefine((value, context) => {
  const expectedJurisdictions: Partial<Record<z.infer<typeof debtKnowledgeLayerSchema>, DebtJurisdiction[]>> = {
    br_debt: ["BR"],
    us_debt: ["US"],
    br_us_bridge: ["BR", "US"],
  };
  const expected = expectedJurisdictions[value.layer];
  if (expected && (expected.length !== value.jurisdictions.length || expected.some((item) => !value.jurisdictions.includes(item)))) {
    context.addIssue({code: "custom", path: ["jurisdictions"], message: "knowledge layer and jurisdictions disagree"});
  }
  const validReuse = value.reuseScope === "global"
    ? ["public", "house_private"].includes(value.access)
    : value.reuseScope === "organization"
      ? value.access === "organization_private"
      : value.access === "project_private";
  if (!validReuse) {
    context.addIssue({code: "custom", path: ["reuseScope"], message: "private knowledge cannot cross its authorized scope"});
  }
  if (["reviewed", "approved"].includes(value.status) && !value.reviewedAt) {
    context.addIssue({code: "custom", path: ["reviewedAt"], message: "reviewed knowledge requires review time"});
  }
});
export type DebtKnowledgeRecord = z.infer<typeof debtKnowledgeRecordSchema>;

/**
 * A locale change recompiles a presentation from the same canonical artifact and Deal State.
 * It never creates a second economic case or treats translated prose as new evidence.
 */
export const localizedArtifactProjectionSchema = z.object({
  artifactId: z.string().uuid(),
  canonicalContentFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  economicStateFingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  sourceLocale: advisorLocaleSchema,
  outputLocale: advisorLocaleSchema,
  translationStatus: z.enum(["not_required", "machine_draft", "reviewed", "approved"]),
  generatedAt: z.iso.datetime(),
}).superRefine((value, context) => {
  if (value.sourceLocale === value.outputLocale && value.translationStatus !== "not_required") {
    context.addIssue({code: "custom", path: ["translationStatus"], message: "same-locale projection does not require translation"});
  }
  if (value.sourceLocale !== value.outputLocale && value.translationStatus === "not_required") {
    context.addIssue({code: "custom", path: ["translationStatus"], message: "cross-locale projection must expose translation status"});
  }
});
export type LocalizedArtifactProjection = z.infer<typeof localizedArtifactProjectionSchema>;

export const requiredDebtKnowledgePacks = [
  {
    id: "debt.universal.core",
    layer: "universal_debt_core",
    jurisdictions: [],
    supportedLocales: ["pt-BR", "en-US"],
    responsibilities: [
      "financial analysis, capacity, capital structure and risk allocation independent of jurisdiction",
      "canonical concept identifiers, calculations and evidence classes",
    ],
    requiresDatedSources: false,
  },
  {
    id: "debt.br.jurisdiction",
    layer: "br_debt",
    jurisdictions: ["BR"],
    supportedLocales: ["pt-BR", "en-US"],
    responsibilities: [
      "Brazilian instruments, providers, security mechanics, documentation and market practice",
      "Brazilian accounting, regulatory and market references with authoritative sources",
    ],
    requiresDatedSources: true,
  },
  {
    id: "debt.us.jurisdiction",
    layer: "us_debt",
    jurisdictions: ["US"],
    supportedLocales: ["pt-BR", "en-US"],
    responsibilities: [
      "US instruments, providers, security mechanics, documentation and market practice",
      "US accounting, regulatory and market references with authoritative sources",
    ],
    requiresDatedSources: true,
  },
  {
    id: "debt.br-us.bridge",
    layer: "br_us_bridge",
    jurisdictions: ["BR", "US"],
    supportedLocales: ["pt-BR", "en-US"],
    responsibilities: [
      "concept-by-concept BR/US mappings with explicit equivalence quality and caveats",
      "cross-border currency, accounting, structural, documentation and market-execution differences",
    ],
    requiresDatedSources: true,
  },
] as const satisfies readonly DebtKnowledgePackRequirement[];
