import {z} from "zod";
import snapshot from "./capital-catalog-2026-09-10.json";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const sourceIds = z.array(z.string().min(1)).min(1);
const institution = z.object({
  id: z.string().min(1), name: z.string().min(1),
  roles: z.array(z.enum(["bank", "arranger", "asset_manager", "development_lender", "equipment_lender", "fiduciary_provider", "securitizer"])).min(1),
  segmentIds: z.array(z.string()).min(1),
  claims: z.array(z.object({field: z.string(), value: z.string().min(1), sourceIds, evidenceStatus: z.literal("publicly_observed"), observedAt: date, structureIds: z.array(z.literal("project_finance")).optional()})),
  vehicles: z.array(z.object({name: z.string(), legalEntityId: z.null(), sourceIds, status: z.literal("publicly_named_identity_and_current_mandate_unconfirmed")})),
  legalEntityId: z.null(), groupId: z.null(),
  borrowerTicket: z.object({minimum: z.null(), maximum: z.null(), currency: z.null(), status: z.literal("not_verified")}),
  currentCapacity: z.null(), currentAppetite: z.literal("unconfirmed"), mandateStatus: z.literal("public_research_only"),
  eligibleForVerifiedMandateMatching: z.literal(false),
});
const schema = z.object({
  schemaVersion: z.literal("offroad.public-capital-research.v1"), asOf: date,
  status: z.literal("research_not_verified_mandates"),
  coverage: z.object({namedOrganizations: z.number().int(), liveMandatesVerified: z.literal(0), totalBrazilianUniverse: z.null(), coveragePercentage: z.null()}),
  segments: z.array(z.object({id: z.string(), description: z.string()})),
  institutions: z.array(institution),
  transactions: z.array(z.object({id: z.string(), issuer: z.string(), instrument: z.enum(["debenture", "financing"]), issueDate: date.nullable(), announcementPeriod: z.string().optional(), maturity: date.optional(), principalAmount: z.number().positive(), currency: z.literal("BRL"), pricing: z.object({type: z.literal("contractual_coupon"), index: z.string(), spreadPercentPerYear: z.number(), observationNotCurrentQuote: z.literal(true)}).nullable(), lenderIdentity: z.string().nullable(), sourceIds, status: z.enum(["issuer_table_requires_final_terms_reconciliation", "approval_announced_disbursement_not_verified"])})),
  pricingObservations: z.array(z.object({institutionId: z.string(), kind: z.literal("advertised_product_floor"), value: z.number(), unit: z.literal("percent_per_month"), product: z.string(), sourceIds, bindingOffer: z.literal(false), totalEffectiveCost: z.null(), borrowerEligibility: z.null()})),
  sources: z.array(z.object({id: z.string(), publisher: z.string(), url: z.string().url().refine(url => new URL(url).protocol === "https:"), title: z.string(), publishedAt: date.nullable(), accessedAt: date, type: z.string()})),
}).superRefine((data, ctx) => {
  for (const collection of [data.institutions, data.sources, data.segments]) {
    if (new Set(collection.map(row => row.id)).size !== collection.length) ctx.addIssue({code: "custom", message: "Duplicate public research identity"});
  }
  const sources = new Set(data.sources.map(source => source.id));
  const segments = new Set(data.segments.map(segment => segment.id));
  const institutions = new Set(data.institutions.map(row => row.id));
  for (const row of [...data.transactions, ...data.pricingObservations]) {
    if (row.sourceIds.some(id => !sources.has(id))) ctx.addIssue({code: "custom", message: "Unresolved historical observation evidence"});
  }
  if (data.transactions.some(row => row.lenderIdentity !== null && !institutions.has(row.lenderIdentity)) || data.pricingObservations.some(row => !institutions.has(row.institutionId))) ctx.addIssue({code: "custom", message: "Unresolved observation institution"});
  for (const row of data.institutions) {
    if (row.segmentIds.some(id => !segments.has(id)) || [...row.claims, ...row.vehicles].some(claim => claim.sourceIds.some(id => !sources.has(id)))) ctx.addIssue({code: "custom", message: "Unresolved public research evidence"});
  }
  if (data.coverage.namedOrganizations !== data.institutions.length) ctx.addIssue({code: "custom", message: "Coverage does not match snapshot"});
});

export const parsePublicCapitalCatalog = (value: unknown) => schema.parse(value);
export const publicCapitalCatalog = parsePublicCapitalCatalog(snapshot);
export type PublicCapitalCatalog = z.infer<typeof schema>;
export type PublicCapitalInstitution = z.infer<typeof institution>;
export type ResearchStructure = "corporate" | "receivables" | "project_finance" | "equipment" | "real_estate" | "venture";
export const researchStructures: ResearchStructure[] = ["corporate", "receivables", "project_finance", "equipment", "real_estate", "venture"];
export type ResearchScreenStatus = "strategy_observed" | "strategy_unconfirmed" | "intermediary_only";

/** A dated research pre-screen, not mandate matching. Missing evidence cannot establish exclusion.
 * Vehicle names (including FIDC) and the borrower's sector never establish eligible assets.
 * The case's economic structure determines the relevant strategy and qualification questions.
 */
export function screenPublicInstitution(provider: PublicCapitalInstitution, structure: ResearchStructure) {
  const segment = structure === "project_finance" ? "infrastructure" : structure;
  const hasCapitalRole = provider.roles.some(role => ["bank", "asset_manager", "development_lender", "equipment_lender"].includes(role));
  const hasStrategyEvidence = provider.claims.some(claim => claim.field === "publicStrategy" && claim.sourceIds.length > 0
    && (structure !== "project_finance" || claim.structureIds?.includes("project_finance")));
  const status: ResearchScreenStatus = !hasCapitalRole ? "intermediary_only"
    : provider.segmentIds.includes(segment) && hasStrategyEvidence ? "strategy_observed" : "strategy_unconfirmed";
  return {
    status, structure, eligibleForVerifiedMandateMatching: false as const,
    researchCandidate: hasCapitalRole && status === "strategy_observed",
    evidenceSourceIds: status === "strategy_observed" ? [...new Set(provider.claims.filter(claim => claim.field === "publicStrategy").flatMap(claim => claim.sourceIds))] : [],
    requiredChecks: ["riskEntity", "ticketTenor", "currentAppetite", "currencySecurity", structure] as const,
  };
}

export function filterPublicInstitutions(catalog: PublicCapitalCatalog, filters: {query?: string; role?: string; segment?: string}) {
  const normalize = (text: string) => text.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");
  const query = normalize(filters.query?.trim() ?? "");
  return catalog.institutions.filter(row => (!filters.role || row.roles.some(role => role === filters.role))
    && (!filters.segment || row.segmentIds.includes(filters.segment))
    && (!query || normalize([row.name, ...row.roles, ...row.segmentIds.map(id => id.replaceAll("_", " ")), ...row.claims.map(claim => claim.value), ...row.vehicles.map(vehicle => vehicle.name)].join(" ")).includes(query)));
}

export const publicCapitalCatalogReference = {schemaVersion: "offroad.public-capital-research.v1", snapshotId: "br-capital-2026-09-10.v1", sourceFingerprint: "f158ac09fc2a44a77d608cc57a1fbb074f7de8b88d558ce9d29bff917429f235", asOf: "2026-09-10"} as const;

export const publicCapitalCatalogSourceSnapshot = snapshot;
