import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";

/** Organizing a folder is not financial math: this kernel resolves identity, versions, readings and
 * findings over typed readings of each file. The only arithmetic is the identity check the method
 * names (a reported total against its own lines, a period against its months), exact in Decimal.
 * Voice: every sentence the method states is a closed template over typed data (dates, amounts,
 * ratios, kinds, registry labels); what a document says travels only as an anchored quote. */
export const documentFolderInventoryVersion = "2026.10.27-v1";
const Exact = Decimal.clone({precision: 60});
const key = z.string().regex(/^[a-z0-9][a-z0-9-]{0,39}$/);
const text = z.string().trim().min(1).max(2000);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const amount = z.string().regex(/^-?\d{1,24}(?:\.\d{1,8})?$/);
const ratio = z.string().regex(/^\d{1,4}(?:\.\d{1,8})?$/);
const decimal = z.string().regex(/^-?\d{1,30}(?:\.\d{1,20})?$/);
const scale = z.enum(["1", "1000", "1000000"]);
const page = z.number().int().min(1).max(5000);
const date = z.iso.date();
/** Where in the file a reading came from: a page, a section (sheet or tab), or both. */
const at = z.strictObject({page: page.nullable(), section: z.string().trim().min(1).max(160).nullable()})
  .refine((a) => a.page !== null || a.section !== null, "A reading names the page or the section it came from");

export const documentKinds = ["annual_financial_statements", "auditor_management_letter", "trial_balance", "management_report", "budget",
  "cash_flow_forecast", "debt_schedule", "debenture_indenture", "bank_credit_note", "development_bank_financing", "customer_contract",
  "supplier_contract", "board_minutes", "shareholders_minutes", "receivables_aging", "appraisal_report", "property_registry",
  "institutional_presentation", "invoice", "unidentified"] as const;
type Kind = (typeof documentKinds)[number];
export const documentStatuses = ["audited", "draft", "signed", "registered", "approved", "working_revision", "closed", "management", "final", "outdated", "marketing", "image"] as const;
type Status = (typeof documentStatuses)[number];
const groupIds = ["statements", "management", "debt", "contracts", "governance", "receivables", "assets", "other"] as const;
type Group = (typeof groupIds)[number];
const groupLabel: Record<Group, string> = {statements: "Demonstrações", management: "Gerencial", debt: "Dívida", contracts: "Contratos",
  governance: "Governança", receivables: "Carteira", assets: "Ativos", other: "Outros"};
/** Content kind decides the subject, how versions relate (by period, by position, by instrument) and the
 * noun the method uses for it: the method never repeats a document's own words as its voice. */
const policy: Record<Kind, {group: Group; family: "period" | "position" | "instrument" | "single"; monthly?: true; external?: true; forecast?: true; label: string; noun: string}> = {
  annual_financial_statements: {group: "statements", family: "period", external: true, label: "Demonstrações", noun: "as demonstrações"},
  auditor_management_letter: {group: "statements", family: "period", label: "Carta de controles", noun: "a carta de controles"},
  trial_balance: {group: "management", family: "period", monthly: true, label: "Balancete", noun: "o balancete"},
  management_report: {group: "management", family: "period", label: "Relatório gerencial", noun: "o relatório gerencial"},
  budget: {group: "management", family: "period", label: "Orçamento", noun: "o orçamento"},
  cash_flow_forecast: {group: "management", family: "position", forecast: true, label: "Fluxo de caixa", noun: "o fluxo de caixa"},
  debt_schedule: {group: "debt", family: "position", label: "Tabela de dívida", noun: "a tabela de dívida"},
  debenture_indenture: {group: "debt", family: "instrument", label: "Escritura", noun: "a escritura"},
  bank_credit_note: {group: "debt", family: "instrument", label: "Cédula de crédito", noun: "a cédula de crédito bancário"},
  development_bank_financing: {group: "debt", family: "instrument", label: "Financiamento", noun: "o contrato de financiamento"},
  customer_contract: {group: "contracts", family: "instrument", label: "Contrato", noun: "o contrato com o cliente"},
  supplier_contract: {group: "contracts", family: "instrument", label: "Contrato", noun: "o contrato com o fornecedor"},
  board_minutes: {group: "governance", family: "single", label: "Ata", noun: "a ata do conselho"},
  shareholders_minutes: {group: "governance", family: "single", label: "Ata", noun: "a ata da assembleia"},
  receivables_aging: {group: "receivables", family: "position", label: "Carteira", noun: "a posição da carteira"},
  appraisal_report: {group: "assets", family: "single", label: "Laudo", noun: "o laudo"},
  property_registry: {group: "assets", family: "single", label: "Matrícula", noun: "a matrícula"},
  institutional_presentation: {group: "other", family: "single", label: "Apresentação", noun: "a apresentação"},
  invoice: {group: "other", family: "single", label: "Nota fiscal", noun: "a nota fiscal"},
  unidentified: {group: "other", family: "single", label: "Documento", noun: "o documento"},
};
/** Terms bind only with evidence of signature or registration; approved or final alone do not. */
const binds = (s: Status) => s === "signed" || s === "registered";
/** Guarantee of a version: audited, signed or registered above the rest; a draft or a revision in work below. */
const guarantee = (s: Status) => s === "audited" || s === "signed" || s === "registered" ? 2 : s === "draft" || s === "working_revision" ? 0 : 1;
export type VersionFacts = {status: Status; ordinal: number | null; date: string | null};
export type VersionCriterion = "guarantee" | "date" | "ordinal";
const criterionValue = (k: VersionCriterion, f: VersionFacts): number | string | null => k === "guarantee" ? guarantee(f.status) : k === "date" ? f.date : f.ordinal;
/** One precedence for every family, as a filter over the whole family: criteria in fixed order (guarantee; the
 * position or effective date, when the family has one; the explicit version number). A criterion is used only
 * if every candidate still standing has a value for it; it keeps the candidates with the highest value. If a
 * candidate lacks the value, the filter stops and the remaining candidates are an explicit conflict. A winner
 * exists only if one candidate is left. Being a filter, it has no cycles and no exception. Dates come before
 * numbers because a number orders versions of the same date only; positions of the same date break ties by number. */
export function resolveVersions<T>(members: readonly T[], factsOf: (m: T) => VersionFacts, criteria: readonly VersionCriterion[]) {
  let candidates = [...members];
  const eliminatedBy = new Map<T, VersionCriterion>();
  for (const k of criteria) {
    if (candidates.length <= 1) break;
    const values = candidates.map((m) => criterionValue(k, factsOf(m)));
    if (values.some((v) => v === null)) return {winner: null, candidates, eliminatedBy, stoppedAt: k as VersionCriterion | null};
    const best = values.reduce((a, b) => (b! > a! ? b : a))!;
    candidates.forEach((m, n) => {if (values[n] !== best) eliminatedBy.set(m, k);});
    candidates = candidates.filter((_, n) => values[n] === best);
  }
  return {winner: candidates.length === 1 ? candidates[0]! : null, candidates, eliminatedBy, stoppedAt: null as VersionCriterion | null};
}

const clause = z.discriminatedUnion("type", [
  z.strictObject({type: z.literal("financial_covenant"), id: key, scope: key.optional(), at, statement: text, metric: z.literal("net_debt_to_ebitda"), maxRatio: ratio}),
  z.strictObject({type: z.literal("negative_pledge"), id: key, scope: key.optional(), at, statement: text, exceptionAmount: amount.nullable(), scale: scale.nullable()}),
  z.strictObject({type: z.literal("assignment_prohibition"), id: key, scope: key.optional(), at, statement: text, counterparty: text, receivablesShare: ratio.nullable()}),
  z.strictObject({type: z.literal("auto_renewal"), id: key, scope: key.optional(), at, statement: text, termEnd: date, noticeDeadline: date}),
  z.strictObject({type: z.literal("payment_term"), id: key, scope: key.optional(), at, statement: text, days: z.number().int().min(0).max(3650)}),
  z.strictObject({type: z.literal("debt_policy"), id: key, scope: key.optional(), at, statement: text, metric: z.literal("net_debt_to_ebitda"), maxRatio: ratio}),
  z.strictObject({type: z.literal("collateral_top_up"), id: key, scope: key.optional(), at, statement: text}),
  z.strictObject({type: z.literal("prepayment"), id: key, scope: key.optional(), at, statement: text}),
]);
type Clause = z.infer<typeof clause>;
const clauseLabel: Record<Clause["type"], string> = {financial_covenant: "covenant", negative_pledge: "garantia negativa", assignment_prohibition: "cessão", auto_renewal: "renovação",
  payment_term: "prazo de pagamento", debt_policy: "política de endividamento", collateral_top_up: "reforço de garantia", prepayment: "pré-pagamento"};
const metrics = ["ebitda", "net_revenue", "gross_revenue", "revenue", "cash", "allowance_for_doubtful_accounts", "inventory_write_off", "appraised_value"] as const;
const metricLabel: Partial<Record<(typeof metrics)[number], [string, string]>> = {allowance_for_doubtful_accounts: ["a provisão para devedores duvidosos", "da provisão para devedores duvidosos"],
  inventory_write_off: ["a baixa de estoque obsoleto", "da baixa de estoque obsoleto"]};
const lineKinds = ["debenture", "bank_credit", "development_bank", "overdraft", "other"] as const;
const lineLabel: Record<(typeof lineKinds)[number], string> = {debenture: "a debênture", bank_credit: "o crédito bancário", development_bank: "o financiamento de fomento",
  overdraft: "a conta garantida", other: "uma linha"};

/** Defense in depth: no field of the output carries reading text outside an anchored quote, and a reading whose
 * free text states a measured ratio, a projection, a recommendation or a validation is refused at the door. */
const forbiddenVoice = /\b(calcul(?:ei|amos|ou|ad[oa]s?)|projet(?:ei|amos|ou)|recomend\w*|sugiro|sugerimos|aconselh\w*|deve-se|validad[oa]s?|validei|validamos|valida[çc][aã]o|autenticidade)\b/i;
const ratioInText = /(\d+(?:[.,]\d+)?)\s*(?:x\b|vezes)/gi;

/** One file as the extraction read it, by content. The file name is carried for display only and is
 * never read by this kernel. Every figure, clause and observation names the page or section it came from. */
export const documentReadingSchema = z.strictObject({
  fileId: key, fileName: z.string().min(1).max(260), sha256: hash,
  format: z.enum(["pdf", "xlsx", "xls", "csv", "pptx", "docx", "jpg", "png"]),
  kind: z.enum(documentKinds), description: text,
  entity: z.strictObject({primaryId: key.nullable(), label: text}),
  period: z.strictObject({label: text, start: date.nullable(), end: date.nullable()}),
  version: z.strictObject({label: text, status: z.enum(documentStatuses), ordinal: z.number().int().min(1).max(99).nullable(), lastUpdated: date.nullable()}),
  /** The instrument the document is or amends, by a reference the extraction normalized from its content. */
  instrument: z.strictObject({ref: key, label: text, amends: key.nullable()}).nullable(),
  asset: z.strictObject({id: key, label: text}).nullable(),
  legibility: z.strictObject({pageCount: z.number().int().min(1).max(5000).nullable(),
    unreadablePages: z.array(z.strictObject({page, reason: z.enum(["illegible_scan", "blank", "corrupted", "password_protected"]),
      /** What the page should hold, read on a legible page of the same file (an index or a cross-reference), never guessed. */
      expectedContent: text.nullable(), expectedFrom: at.nullable()})).max(500),
    wholeFile: z.strictObject({reason: z.enum(["no_extractable_content", "unsupported_format", "password_protected"])}).nullable()}),
  /** A legible copy of pages another file of the same instrument could not give. */
  substitutesPages: z.strictObject({instrumentRef: key, pages: z.array(page).min(1).max(500)}).nullable(),
  units: z.array(z.strictObject({section: z.string().trim().min(1).max(160), currency: z.string().regex(/^[A-Z]{3}$/), scale})).max(50),
  figures: z.array(z.strictObject({id: key, metric: z.enum(metrics), value: amount, scale, at})).max(100),
  clauses: z.array(clause).max(100),
  observations: z.array(z.strictObject({id: key, at, topic: z.enum(["internal_controls", "supplier_terms", "shareholder_resolution", "revision_note", "other"]), statement: text})).max(50),
  debtTable: z.strictObject({lines: z.array(z.strictObject({id: key, lineKind: z.enum(lineKinds), label: text, drawn: amount, limit: amount.nullable(), counted: amount})).min(1).max(100),
    reportedTotal: amount, scale, at}).nullable(),
}).superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  const ids = [...r.figures.map((f) => f.id), ...r.clauses.map((c) => c.id), ...r.observations.map((o) => o.id)];
  if (new Set(ids).size !== ids.length) fail("document_inventory_duplicate_reading_id");
  const unreadable = new Set(r.legibility.unreadablePages.map((p) => p.page));
  if (unreadable.size !== r.legibility.unreadablePages.length) fail("document_inventory_duplicate_unreadable_page");
  const located = [...r.figures.map((f) => f.at), ...r.clauses.map((c) => c.at), ...r.observations.map((o) => o.at), ...r.debtTable ? [r.debtTable.at] : []];
  // Every page the reading names (unreadable, read, or the source of what a page holds) exists in the file.
  const named = [...unreadable, ...located.flatMap((a) => a.page === null ? [] : [a.page]), ...r.legibility.unreadablePages.flatMap((p) => p.expectedFrom?.page ? [p.expectedFrom.page] : [])];
  if (r.legibility.pageCount !== null && named.some((p) => p > r.legibility.pageCount!)) fail("document_inventory_page_outside_file");
  // Nothing is read from what could not be read. In a file with an unreadable page every reading names its page:
  // a section alone could stand for the page that was not read.
  if (located.some((a) => a.page !== null && unreadable.has(a.page))) fail("document_inventory_content_on_unreadable_page");
  if (unreadable.size && located.some((a) => a.page === null)) fail("document_inventory_unpaged_reading_in_partly_unreadable_file");
  // What a page should hold is read somewhere legible and anchored there; otherwise it is not said.
  for (const p of r.legibility.unreadablePages) if (p.expectedContent !== null && (p.expectedFrom === null || p.expectedFrom.page === null || unreadable.has(p.expectedFrom.page)))
    fail("document_inventory_expected_content_without_legible_source");
  if (r.legibility.unreadablePages.some((p) => p.expectedContent === null && p.expectedFrom !== null)) fail("document_inventory_expected_content_without_legible_source");
  // A substitute is read only on the pages it substitutes.
  if (r.substitutesPages && (located.some((a) => a.page === null || !r.substitutesPages!.pages.includes(a.page)) || r.units.length)) fail("document_inventory_substitute_outside_its_pages");
  if (r.legibility.wholeFile && (located.length || r.units.length || r.legibility.unreadablePages.length)) fail("document_inventory_content_on_unreadable_file");
  for (const l of r.debtTable?.lines ?? []) if (l.limit !== null && new Exact(l.drawn).gt(l.limit)) fail("document_inventory_drawn_above_limit");
  if (r.instrument?.amends === r.instrument?.ref && r.instrument !== null) fail("document_inventory_amends_itself");
  if (r.substitutesPages && (r.legibility.unreadablePages.length || r.legibility.wholeFile)) fail("document_inventory_substitute_not_legible");
  const texts = [r.description, r.entity.label, r.period.label, r.version.label, r.instrument?.label, r.asset?.label, ...r.legibility.unreadablePages.map((p) => p.expectedContent),
    ...r.clauses.flatMap((c) => c.type === "assignment_prohibition" ? [c.statement, c.counterparty] : [c.statement]), ...r.observations.map((o) => o.statement),
    ...r.units.map((u) => u.section), ...located.map((a) => a.section), ...r.debtTable?.lines.map((l) => l.label) ?? []].filter((x): x is string => typeof x === "string");
  if (texts.some((t) => forbiddenVoice.test(t))) fail("document_inventory_free_text_outside_reading");
  for (const c of r.clauses) {
    const ratios = [...c.statement.matchAll(ratioInText)].map((m) => m[1]!.replace(",", "."));
    const allowed = c.type === "financial_covenant" || c.type === "debt_policy" ? c.maxRatio : null;
    if (ratios.some((x) => allowed === null || !new Exact(x).eq(allowed))) fail("document_inventory_free_text_outside_reading");
  }
  if (texts.filter((t) => !r.clauses.some((c) => c.statement === t)).some((t) => new RegExp(ratioInText.source, "i").test(t))) fail("document_inventory_free_text_outside_reading");
});
export type DocumentReading = z.infer<typeof documentReadingSchema>;

export const inventoryModes = ["organize", "organize_only", "organize_for_debt"] as const;
const decisionKinds = ["financing_plan", "investment_project", "debt_discussion"] as const;
/** What each open decision makes a finding matter for, and what it needs that the folder may lack. */
const topics = ["debt_covenant", "debt_policy", "receivables_assignment", "supplier_contract", "debt_position", "statements_version", "group_perimeter"] as const;
type Topic = (typeof topics)[number];
const needs = ["monthly_series", "reading_substitute", "real_collateral", "group_perimeter", "liquidity_projection"] as const;
type Need = (typeof needs)[number];
const purposes: Record<(typeof decisionKinds)[number] | "debt_analysis" | "projection" | "bank_material", {topics: Topic[]; needs: Need[]}> = {
  financing_plan: {topics: ["debt_covenant", "debt_policy", "receivables_assignment", "debt_position", "statements_version", "group_perimeter"],
    needs: ["monthly_series", "reading_substitute", "real_collateral", "group_perimeter", "liquidity_projection"]},
  investment_project: {topics: ["supplier_contract"], needs: []},
  debt_discussion: {topics: ["debt_covenant", "debt_policy", "receivables_assignment", "debt_position", "statements_version"], needs: ["reading_substitute", "real_collateral"]},
  // With no decision in course, the likely uses: debt analysis, projection and material for banks.
  debt_analysis: {topics: [], needs: ["reading_substitute", "real_collateral"]},
  projection: {topics: [], needs: ["monthly_series", "liquidity_projection"]},
  bank_material: {topics: [], needs: ["group_perimeter"]},
};
/** What any inventory asks, whatever the purpose: a legible copy of what was not read and the month missing from a series. */
const inventoryNeeds: Need[] = ["monthly_series", "reading_substitute"];
const effects = ["binding_limit", "policy_limit", "collateral_restriction", "deadline", "figure_correction", "version_conflict", "perimeter"] as const;
type Effect = (typeof effects)[number];
/** Without a decision in course: versions first, then contractual restrictions, then approved policies. */
const generalOrder: Effect[] = ["version_conflict", "binding_limit", "collateral_restriction", "deadline", "policy_limit", "figure_correction", "perimeter"];

const source = z.strictObject({fileId: key, page: page.nullable(), section: z.string().min(1).max(160).nullable()});
/** A document's own words, with the file and the page or sheet they were read on. */
const quote = source.extend({text}).strict();
const situationSchema = z.strictObject({read: z.enum(["complete", "partial", "unreadable", "conflicted"]), unreadablePages: z.array(page).max(500),
  pagesFrom: z.array(z.strictObject({page, fileId: key, sha256: hash})).max(500), duplicateOf: key.nullable(),
  supersededBy: z.strictObject({fileId: key, reason: z.enum(["audited_over_draft", "higher_assurance", "later_version", "later_position"])}).nullable(),
  sideBySideWith: z.array(key).max(20), inVault: key.nullable()});
/** The descriptive fields of a row quote the file's own reading, anchored on the row's file. */
const rowSchema = z.strictObject({fileId: key, fileName: z.string().min(1).max(260), sha256: hash, order: z.number().int().min(0),
  partition: key.nullable(), group: z.enum(groupIds), groupLabel: text, kind: z.enum(documentKinds),
  description: text, entity: text, period: text, version: text, status: z.enum(documentStatuses).nullable(),
  situation: situationSchema, situationLabel: text, findingIds: z.array(z.string().min(1).max(80)).max(50),
  /** Presence is not confirmation: no document is ever declared validated. */
  validated: z.literal(false)});
const findingCodes = ["duplicate", "draft_superseded", "version_superseded", "position_superseded", "versions_side_by_side", "versions_unresolved", "series_gap", "mixed_units",
  "stale_forecast", "total_includes_unused_limit", "total_not_recomposed", "amended_original", "amendment_in_force", "amendment_superseded", "amendment_not_in_force",
  "amendment_conflict", "amendment_future", "amendment_without_original", "clause_unread", "clause_future", "figure_conflict", "instrument_not_in_force", "instrument_superseded", "instrument_conflict", "instrument_future", "clause_superseded", "clause_conflict",
  "clause_not_in_force", "reading_conflict", "substitute_conflict", "page_unreadable",
  "file_unreadable", "clause", "observation", "subsidiary_in_consolidated", "appraisal_without_registry", "figure_basis_differs"] as const;
const findingSchema = z.strictObject({id: z.string().min(1).max(80), code: z.enum(findingCodes),
  anchor: key, sources: z.array(source).min(1).max(20), statement: text, topic: z.enum(topics).nullable(), effect: z.enum(effects).nullable(),
  decisionStatement: text.nullable(),
  /** The state of knowledge the finding stands on; an effect requires "known". */
  knowledge: z.enum(["known", "future", "unread", "missing_source", "conflict"]),
  /** What the document itself says, quoted with its own source; never the method's voice. */
  quoted: quote.nullable(),
  /** For an amendment: each clause it sets, with the clause it replaces and the new one, both quoted by anchor. */
  changes: z.array(z.strictObject({type: z.string().min(1).max(90), current: z.boolean(), before: quote.nullable(), after: quote})).max(20).nullable(),
  status: z.enum(["open", "resolved"]), resolvedBy: z.array(key).max(20)});
export const documentFolderInventoryOutputSchema = z.strictObject({
  schemaVersion: z.literal("document-folder-inventory.v1"), version: z.literal(documentFolderInventoryVersion), asOf: date, mode: z.enum(inventoryModes),
  partitionByEntity: z.boolean(),
  rows: z.array(rowSchema).min(1).max(250),
  groups: z.array(z.strictObject({partition: key.nullable(), group: z.enum(groupIds), label: text, fileIds: z.array(key).min(1)})).max(200),
  families: z.array(z.strictObject({id: z.string().min(1).max(120), basis: z.enum(["period", "position", "instrument"]),
    resolution: z.enum(["audited_over_draft", "higher_assurance", "later_version", "later_position", "side_by_side", "unresolved", "effective_text"]),
    prevails: z.array(key).max(20), superseded: z.array(key).max(20), sideBySide: z.array(key).max(20), highlighted: z.boolean()})).max(100),
  /** The text in force of each instrument: the clause of each type in force, and the types two amendments set differently with nothing to rank them. */
  effectiveTexts: z.array(z.strictObject({instrumentRef: key, fileIds: z.array(key).min(2),
    clauses: z.array(z.strictObject({type: z.string().min(1).max(90), fileId: key, clauseId: key})).max(100),
    conflicts: z.array(z.strictObject({type: z.string().min(1).max(90), fileIds: z.array(key).min(1)})).max(20),
    /** Clauses an amendment may change on a page not read: no text in force is stated for them. */
    unread: z.array(z.strictObject({type: z.string().min(1).max(90), fileIds: z.array(key).min(1)})).max(20),
    /** Signed or registered amendments effective after the reading date: preserved as future text, never current. */
    future: z.array(z.strictObject({fileId: key, from: date})).max(20)})).max(50),
  findings: z.array(findingSchema).max(500),
  /** Findings ordered by their effect on the decisions in course; absent when the request is to organize only. */
  decisionFindings: z.array(z.strictObject({rank: z.number().int().min(1), findingId: z.string().min(1).max(80), decisionIds: z.array(key).min(1), effect: z.enum(effects), statement: text, sources: z.array(source).min(1)})).max(100).nullable(),
  /** Without a decision in course, the findings that matter by general relevance. */
  generalFindings: z.array(z.strictObject({rank: z.number().int().min(1), findingId: z.string().min(1).max(80), effect: z.enum(effects), statement: text})).max(100).nullable(),
  identityChecks: z.array(z.strictObject({id: z.string().min(1).max(80), kind: z.enum(["reported_total", "period_against_months"]), fileIds: z.array(key).min(1),
    status: z.enum(["matches", "differs", "not_run"]), reported: decimal.nullable(), recomposed: decimal.nullable(), currency: z.string().regex(/^[A-Z]{3}$/), reason: z.string().min(1).max(200).nullable()})).max(50),
  gaps: z.array(z.strictObject({id: z.string().min(1).max(80), need: z.enum(needs), item: text, why: text, quoted: quote.nullable(), purposes: z.array(key).min(1), findingId: z.string().min(1).max(80).nullable(),
    conditional: z.boolean(), status: z.enum(["open", "resolved"]), resolvedBy: z.array(key).max(20)})).max(100),
  questions: z.array(z.strictObject({id: z.string().min(1).max(80), text, fileIds: z.array(key).max(250), findingId: z.string().min(1).max(80).nullable(), status: z.enum(["open", "answered"]), answeredBy: key.nullable()})).max(10)
    .refine((q) => q.filter((x) => x.status === "open").length <= 2, "At most two open questions"),
  /** Facts the person informed, with author and date; recorded as informed, never as the method's voice. */
  informed: z.array(z.strictObject({id: key, questionId: z.string().min(1).max(80), statement: text, author: text, date, origin: z.literal("informed")})).max(20),
  followUps: z.array(z.discriminatedUnion("kind", [
    z.strictObject({kind: z.literal("notice_deadline"), date, fileId: key, clauseId: key, decisionIds: z.array(key), scheduled: z.literal(false)}),
    z.strictObject({kind: z.literal("effective_text"), instrumentRef: key, fileIds: z.array(key).min(2)})])).max(50),
  counts: z.strictObject({files: z.number().int(), duplicates: z.number().int(), incompleteReadings: z.number().int(), superseded: z.number().int(),
    inVault: z.number().int(), withFinding: z.number().int(), pageSubstitutes: z.number().int()}),
  /** Hashes read two different ways: every file with that hash is suspended for every use until the reading is redone. */
  readingConflicts: z.array(z.strictObject({sha256: hash.nullable(), page: page.nullable(), fileIds: z.array(key).min(2)})).max(250),
  update: z.strictObject({priorFingerprint: hash, rowsUpdated: z.array(key), rowsAdded: z.array(key), rowsPreserved: z.number().int(),
    findingsResolved: z.array(z.string()), findingsAdded: z.array(z.string()), gapsResolved: z.array(z.string()), questionsAnswered: z.array(z.string())}).nullable(),
}).refine((o) => o.counts.files === o.rows.length, "Every file is a row").refine((o) => new Set(o.rows.map((r) => r.fileId)).size === o.rows.length, "Duplicate row")
  .refine((o) => new Set(o.findings.map((f) => f.id)).size === o.findings.length, "Duplicate finding id")
  .refine((o) => o.findings.every((f) => f.effect === null || f.knowledge === "known"), "Only known findings have effect");
export type DocumentFolderInventory = z.infer<typeof documentFolderInventoryOutputSchema>;

export const documentFolderInventoryInputSchema = z.strictObject({
  asOf: date, mode: z.enum(inventoryModes), currency: z.string().regex(/^[A-Z]{3}$/),
  /** The company's registry: entities, their group and the controlling entity. */
  entities: z.array(z.strictObject({id: key, label: text, groupId: key, groupLabel: text, parentId: key.nullable(), ownership: ratio.nullable()})).min(1).max(50),
  decisions: z.array(z.strictObject({id: key, label: text, kind: z.enum(decisionKinds)})).max(12),
  vault: z.array(z.strictObject({documentId: key, sha256: hash, label: text, instrumentRef: key.nullable()})).max(500),
  /** In arrival order. */
  files: z.array(documentReadingSchema).min(1).max(250),
  informed: z.array(z.strictObject({id: key, questionId: z.string().min(1).max(80), statement: text, author: text, date})).max(20),
  /** The inventory this one updates, as it was produced; every row not touched by what arrived is preserved byte for byte. */
  prior: z.strictObject({inventory: documentFolderInventoryOutputSchema, fingerprint: hash}).nullable(),
}).superRefine((i, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  if (new Set(i.files.map((f) => f.fileId)).size !== i.files.length) fail("document_inventory_duplicate_file");
  if (new Set(i.entities.map((e) => e.id)).size !== i.entities.length) fail("document_inventory_duplicate_entity");
  if (new Set(i.decisions.map((d) => d.id)).size !== i.decisions.length) fail("document_inventory_duplicate_decision");
  if (i.entities.some((e) => e.parentId !== null && !i.entities.some((p) => p.id === e.parentId))) fail("document_inventory_unknown_parent");
  for (const e of i.entities) if (forbiddenVoice.test(e.label) || forbiddenVoice.test(e.groupLabel)) fail("document_inventory_free_text_outside_reading");
});
export type DocumentFolderInventoryInput = z.input<typeof documentFolderInventoryInputSchema>;

// Key order differs between a rebuilt value and its stored form; identity is on content.
const canonical = (v: unknown): unknown => Array.isArray(v) ? v.map(canonical)
  : v !== null && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canonical((v as Record<string, unknown>)[k])])) : v;
export const inventoryFingerprint = (v: unknown) => createHash("sha256").update(JSON.stringify(canonical(v))).digest("hex");

const months = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const longDate = (d: string) => `${Number(d.slice(8, 10))} de ${months[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;
const monthName = (d: string) => `${months[Number(d.slice(5, 7)) - 1]} de ${d.slice(0, 4)}`;
const comma = (v: Decimal) => v.toFixed().replace(".", ",");
/** Amounts in the reading's own scale, shown in millions of reais. */
function brl(value: string, s: string) {
  const m = new Exact(value).mul(s).div(1000000);
  const shown = m.isInteger() ? m.toFixed(0) : comma(m.toDecimalPlaces(1));
  return `R$ ${shown} ${m.abs().lt(2) ? "milhão" : "milhões"}`;
}
const times = (r: string) => {const v = new Exact(r); return `${(v.isInteger() ? v.toFixed(1) : v.toFixed()).replace(".", ",")}x`;};
const percent = (r: string) => `${comma(new Exact(r).mul(100))}%`;
const scaleLabel: Record<string, string> = {"1": "R$", "1000": "R$ mil", "1000000": "R$ milhões"};
const inReais = (value: string, s: string) => new Exact(value).mul(s);
const monthsBetween = (start: string, end: string) => {
  const out: string[] = []; let y = Number(start.slice(0, 4)), m = Number(start.slice(5, 7));
  while (`${y}-${String(m).padStart(2, "0")}` <= end.slice(0, 7)) {out.push(`${y}-${String(m).padStart(2, "0")}`); m++; if (m > 12) {m = 1; y++;}}
  return out;
};
const lastDay = (ym: string) => new Date(Date.UTC(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0)).toISOString().slice(0, 10);
const isMonth = (r: DocumentReading) => r.period.start !== null && r.period.end !== null && r.period.start.endsWith("-01")
  && r.period.start.slice(0, 7) === r.period.end.slice(0, 7) && r.period.end === lastDay(r.period.start.slice(0, 7));
/** The period in the method's voice, from the typed dates only. */
function periodText(r: DocumentReading) {
  const {start, end} = r.period;
  if (!start || !end) return end ? longDate(end) : "período não lido";
  if (start === end) return longDate(end);
  if (isMonth(r)) return monthName(start);
  if (start.endsWith("-01-01") && end === `${start.slice(0, 4)}-12-31`) return start.slice(0, 4);
  return `${longDate(start)} a ${longDate(end)}`;
}
const of = (noun: string) => noun.replace(/^(as|os|a|o) /, (m) => ({"a ": "da ", "o ": "do ", "as ": "das ", "os ": "dos "})[m]!);
const capital = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const byKey = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;

type Finding = z.infer<typeof findingSchema>;
/** Knowledge of a derived value, worst of its inputs, in this fixed order from best to worst. Only "known" has effect. */
export const knowledgeStates = ["known", "future", "unread", "missing_source", "conflict"] as const;
export type Knowledge = (typeof knowledgeStates)[number];
export const worstKnowledge = (...states: Knowledge[]): Knowledge => states.reduce<Knowledge>((a, b) => knowledgeStates.indexOf(b) > knowledgeStates.indexOf(a) ? b : a, "known");
type Row = z.infer<typeof rowSchema>;
type Quote = z.infer<typeof quote>;
type Held = {c: Clause; fileId: string} | {conflict: string[]};

/** Organizes a folder from typed readings of each file: identity by hash among the files and against
 * the vault, with a hash read two ways suspended; version families resolved without deleting any and
 * never by arrival; signed or registered amendments joined to the original as one text in force, each
 * change compared with the text it replaces; what was not read, by page; findings with their source
 * and effect, ordered by the decisions in course; gaps by purpose; at most two questions. A later call
 * with the prior inventory updates only the rows what arrived touches. It never classifies by file name,
 * never calculates ratios, projects or recommends, and never declares a document validated. */
export function organizeDocumentFolder(raw: DocumentFolderInventoryInput): DocumentFolderInventory {
  const input = documentFolderInventoryInputSchema.parse(raw);
  const registry = new Map(input.entities.map((e) => [e.id, e]));
  const substitutes = input.files.filter((f) => f.substitutesPages !== null);
  const documents = input.files.filter((f) => f.substitutesPages === null);
  const byId = new Map(input.files.map((f) => [f.fileId, f]));
  const order = new Map(input.files.map((f, n) => [f.fileId, n]));
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "status" | "resolvedBy" | "topic" | "effect" | "decisionStatement" | "quoted" | "changes" | "knowledge"> & Partial<Pick<Finding, "topic" | "effect" | "decisionStatement" | "quoted" | "changes" | "knowledge">>) =>
    findings.push({topic: null, effect: null, decisionStatement: null, quoted: null, changes: null, knowledge: "known", ...f, status: "open", resolvedBy: []});
  const src = (fileId: string, a: {page: number | null; section: string | null} | null = null) => ({fileId, page: a?.page ?? null, section: a?.section ?? null});
  const cite = (fileId: string, a: {page: number | null; section: string | null}, words: string): Quote => ({...src(fileId, a), text: words});

  // Identity and suspension by hash over every file, page substitutes included: the same bytes read two ways
  // suspend every file with that hash for every use, whatever arrived first.
  const content = (f: DocumentReading) => JSON.stringify(canonical({...f, fileId: null, fileName: null}));
  const readingConflicts: DocumentFolderInventory["readingConflicts"] = [...new Set(input.files.map((f) => f.sha256))].flatMap((sha) => {
    const same = input.files.filter((f) => f.sha256 === sha);
    return new Set(same.map(content)).size > 1 ? [{sha256: sha, page: null, fileIds: same.map((f) => f.fileId).sort(byKey)}] : [];
  });
  const suspended = new Set(readingConflicts.flatMap((c) => c.fileIds));
  const firstByHash = new Map<string, string>(), duplicateOf = new Map<string, string>();
  for (const f of documents) {
    const first = firstByHash.get(f.sha256);
    if (first) duplicateOf.set(f.fileId, first); else firstByHash.set(f.sha256, f.fileId);
  }
  for (const c of readingConflicts) for (const id of c.fileIds) if (documents.includes(byId.get(id)!)) add({id: `${id}-reading-conflict`, code: "reading_conflict", anchor: id, sources: c.fileIds.map((x) => src(x)),
    statement: "Mesmo hash, leituras diferentes: o conteúdo é um só e a leitura precisa ser refeita. Nenhuma das leituras é usada até lá."});
  const vaultByHash = new Map(input.vault.map((v) => [v.sha256, v.documentId]));
  const live = documents.filter((f) => !duplicateOf.has(f.fileId) && !suspended.has(f.fileId));
  /** A copy is read as the document it repeats: same hash, same content, same reading. */
  const readingOf = (f: DocumentReading) => byId.get(duplicateOf.get(f.fileId) ?? f.fileId)!;

  // Pages read from a legible copy of the same instrument. A page is completed only from one reading: two
  // substitutes of the same page that read it differently leave it unread, and the conflict is declared.
  const pagesFrom = new Map<string, {page: number; fileId: string; sha256: string}[]>();
  const substituted = new Set<string>();
  const offered = new Map<string, DocumentReading[]>();
  for (const s of substitutes) {
    const targets = live.filter((f) => f.instrument?.ref === s.substitutesPages!.instrumentRef
      && s.substitutesPages!.pages.every((p) => f.legibility.unreadablePages.some((u) => u.page === p)));
    const named = live.filter((f) => f.instrument?.ref === s.substitutesPages!.instrumentRef);
    if (!named.length && !documents.some((f) => f.instrument?.ref === s.substitutesPages!.instrumentRef)) throw new Error("document_inventory_substitute_without_target");
    if (named.length && !targets.length) throw new Error("document_inventory_substitute_for_legible_page");
    if (targets.length > 1) throw new Error("document_inventory_substitute_target_ambiguous");
    const target = targets[0];
    if (!target) continue;
    substituted.add(target.fileId);
    if (target.legibility.pageCount !== null && s.substitutesPages!.pages.some((p) => p > target.legibility.pageCount!)) throw new Error("document_inventory_page_outside_file");
    if (suspended.has(s.fileId)) continue;
    for (const p of s.substitutesPages!.pages) offered.set(`${target.fileId}|${p}`, [...offered.get(`${target.fileId}|${p}`) ?? [], s]);
  }
  for (const [k, list] of [...offered].sort(([a], [b]) => byKey(a, b))) {
    const [targetId, pageText] = k.split("|") as [string, string], page = Number(pageText);
    // Copies of a page are compared on every typed reading anchored there: clauses, figures, observations and the debt table.
    const onPage = (s: DocumentReading) => JSON.stringify(canonical({items: [...s.clauses, ...s.figures, ...s.observations].filter((x) => x.at.page === page).map((x) => ({...x, id: null})),
      debtTable: s.debtTable && s.debtTable.at.page === page ? s.debtTable : null}));
    if (new Set(list.map(onPage)).size > 1) {
      const fileIds = list.map((s) => s.fileId).sort(byKey);
      readingConflicts.push({sha256: null, page, fileIds});
      add({id: `${targetId}-substitute-conflict-p${page}`, code: "substitute_conflict", anchor: targetId, sources: fileIds.map((x) => src(x, {page, section: null})),
        statement: `Há ${fileIds.length} cópias da página ${page} com leituras diferentes; a página continua sem leitura até a divergência ser resolvida.`});
      continue;
    }
    // Same reading of the page in every copy: the lowest file id carries it.
    const s = [...list].sort((a, b) => byKey(a.fileId, b.fileId))[0]!;
    pagesFrom.set(targetId, [...pagesFrom.get(targetId) ?? [], {page, fileId: s.fileId, sha256: s.sha256}].sort((a, b) => a.page - b.page));
  }
  const stillUnreadable = (f: DocumentReading) => f.legibility.unreadablePages.filter((p) => !(pagesFrom.get(f.fileId) ?? []).some((x) => x.page === p.page));

  // Version families: one precedence function for every family, by content and never by arrival.
  const superseded = new Map<string, {fileId: string; reason: "audited_over_draft" | "higher_assurance" | "later_version" | "later_position"}>();
  const sideBySide = new Map<string, string[]>();
  const families: DocumentFolderInventory["families"] = [];
  /** One value per metric and document: concurrent values that differ are a conflict, never the first of the list. */
  const figureList = (f: DocumentReading, metric: string) => f.figures.filter((x) => x.metric === metric);
  const figureState = (f: DocumentReading, metric: string): Knowledge => {
    const list = figureList(f, metric);
    return !list.length ? "missing_source" : list.every((x) => inReais(x.value, x.scale).eq(inReais(list[0]!.value, list[0]!.scale))) ? "known" : "conflict";
  };
  const figure = (f: DocumentReading, metric: string) => figureState(f, metric) === "known" ? figureList(f, metric)[0]! : null;
  for (const f of live) for (const metric of [...new Set(f.figures.map((x) => x.metric))].sort(byKey)) if (figureState(f, metric) === "conflict")
    add({id: `${f.fileId}-figure-conflict-${metric.replace(/_/g, "-")}`, code: "figure_conflict", anchor: f.fileId, sources: figureList(f, metric).map((x) => src(f.fileId, x.at)), knowledge: "conflict",
      statement: `O documento traz valores diferentes para a mesma medida; nenhum foi usado até a leitura ser conferida.`});
  const bucket = <T>(items: T[], k: (x: T) => string | null) => {const m = new Map<string, T[]>(); for (const x of items) {const g = k(x); if (g !== null) m.set(g, [...m.get(g) ?? [], x]);} return m;};
  const ids = (list: DocumentReading[]) => list.map((m) => m.fileId).sort(byKey);
  const facts = (f: DocumentReading, date: string | null): VersionFacts => ({status: f.version.status, ordinal: f.version.ordinal, date});
  const resolveFamily = (members: DocumentReading[], criteria: VersionCriterion[], dateOf: (f: DocumentReading) => string | null) =>
    resolveVersions(members, (f) => facts(f, dateOf(f)), criteria);
  const reasonFor = (w: DocumentReading, l: DocumentReading, k: VersionCriterion) => k === "guarantee"
    ? (w.version.status === "audited" && l.version.status === "draft" ? "audited_over_draft" as const : "higher_assurance" as const) : k === "date" ? "later_position" as const : "later_version" as const;
  const unresolvedFamily = (id: string, basis: "period" | "position" | "instrument", members: DocumentReading[], what: string) => {
    families.push({id, basis, resolution: "unresolved", prevails: [], superseded: [], sideBySide: ids(members), highlighted: false});
    for (const m of members) add({id: `${m.fileId}-unresolved`, code: "versions_unresolved", anchor: m.fileId, sources: ids(members).map((x) => src(x)),
      statement: `Há ${members.length} ${what} de ${periodText(m)} sem nada no conteúdo que as distinga; nenhuma foi escolhida.`});
  };

  for (const [id, members] of bucket(live.filter((f) => policy[f.kind].family === "period"), (f) => f.period.start && f.period.end && f.entity.primaryId
    ? `${f.kind}:${f.entity.primaryId}:${f.period.start}:${f.period.end}` : null)) {
    if (members.length < 2) continue;
    const statuses = new Set(members.map((m) => m.version.status));
    if (statuses.has("approved") && statuses.has("working_revision") && members.every((m) => ["approved", "working_revision"].includes(m.version.status))) {
      // House policy before precedence: an approved plan and a revision still in work are both kept; neither is chosen.
      members.forEach((m) => sideBySide.set(m.fileId, ids(members.filter((x) => x !== m))));
      families.push({id, basis: "period", resolution: "side_by_side", prevails: [], superseded: [], sideBySide: ids(members), highlighted: false});
      const approved = members.filter((m) => m.version.status === "approved");
      for (const rev of members.filter((m) => m.version.status === "working_revision")) {
        const a = approved.length === 1 ? figure(approved[0]!, "ebitda") : null, b = figure(rev, "ebitda");
        add({id: `${rev.fileId}-side-by-side`, code: "versions_side_by_side", anchor: rev.fileId, sources: [src(rev.fileId, b?.at), ...approved.map((x) => src(x.fileId, a?.at))],
          statement: `${a && b ? `EBITDA de ${periodText(rev)} revisto para ${brl(b.value, b.scale)} contra ${brl(a.value, a.scale)} no aprovado. ` : ""}Preservar as duas: aprovado e revisão em trabalho.`});
      }
      continue;
    }
    // Same period by construction: the family has no date criterion.
    const r = resolveFamily(members, ["guarantee", "ordinal"], () => null), winner = r.winner;
    if (!winner) {unresolvedFamily(id, "period", members, "versões"); continue;}
    const losers = members.filter((m) => m !== winner).sort((a, b) => byKey(a.fileId, b.fileId));
    for (const l of losers) {
      const reason = reasonFor(winner, l, r.eliminatedBy.get(l)!);
      superseded.set(l.fileId, {fileId: winner.fileId, reason});
      if (reason === "audited_over_draft") {
        const a = figure(winner, "ebitda"), d = figure(l, "ebitda");
        const only = winner.figures.filter((x) => metricLabel[x.metric] && !l.figures.some((y) => y.metric === x.metric));
        const items = only.map((x) => `${metricLabel[x.metric]![0]} (${brl(x.value, x.scale)})`).join(" nem ");
        const compare = a && d ? `EBITDA de ${brl(d.value, d.scale)} contra ${brl(a.value, a.scale)} na auditada` : "Versão anterior à auditada";
        add({id: `${l.fileId}-draft`, code: "draft_superseded", anchor: l.fileId, sources: [src(l.fileId, d?.at), src(winner.fileId, a?.at)],
          statement: `${compare}${items ? `: a minuta não tem ${items}` : ""}. Verificar se essa versão foi enviada a algum banco.`,
          topic: "statements_version", effect: "version_conflict",
          decisionStatement: `Há duas versões ${of(policy[winner.kind].noun)} de ${periodText(winner)}. `
            + (a && d ? `A minuta tem EBITDA de ${brl(d.value, d.scale)}; a auditada, ${brl(a.value, a.scale)}${only.length ? `, depois ${only.map((x) => metricLabel[x.metric]![1]).join(" e ")}` : ""}. ` : "")
            + "A auditada é a que vale."});
      } else {
        const note = winner.observations.find((o) => o.topic === "revision_note");
        add({id: `${l.fileId}-superseded`, code: "version_superseded", anchor: l.fileId, sources: [src(l.fileId), ...note ? [src(winner.fileId, note.at)] : [src(winner.fileId)]],
          statement: `Duas versões de ${periodText(l)}; ${winner.version.ordinal !== null && reason === "later_version" ? `a v${winner.version.ordinal}` : "a de maior asseguração"} vale e esta fica como histórico.`,
          quoted: note ? cite(winner.fileId, note.at, note.statement) : null});
      }
    }
    families.push({id, basis: "period", resolution: superseded.get(losers[0]!.fileId)!.reason, prevails: [winner.fileId], superseded: ids(losers), sideBySide: [], highlighted: false});
  }

  for (const [id, members] of bucket(live.filter((f) => policy[f.kind].family === "position"), (f) => f.entity.primaryId ? `${f.kind}:${f.entity.primaryId}` : null)) {
    if (members.length < 2) continue;
    const r = resolveFamily(members, ["guarantee", "date", "ordinal"], (f) => f.period.end), winner = r.winner;
    if (!winner) {unresolvedFamily(id, "position", members, "posições"); continue;}
    const losers = members.filter((m) => m !== winner).sort((a, b) => byKey(a.fileId, b.fileId));
    for (const l of losers) {
      superseded.set(l.fileId, {fileId: winner.fileId, reason: reasonFor(winner, l, r.eliminatedBy.get(l)!)});
      add({id: `${l.fileId}-superseded`, code: "position_superseded", anchor: l.fileId, sources: [src(l.fileId), src(winner.fileId)],
        statement: `Versão de ${periodText(l)} ${of(policy[l.kind].noun.replace(/^(a|o) /, "$1 mesma ").replace("o mesma", "o mesmo"))}. Histórico, não base atual.`});
    }
    families.push({id, basis: "position", resolution: superseded.get(losers[0]!.fileId)!.reason, prevails: [winner.fileId], superseded: ids(losers), sideBySide: [], highlighted: false});
  }

  // Text in force. First the reading of each instrument is completed with the pages its substitutes recovered;
  // only then is force resolved: the original by the one precedence (no winner, no text in force), then each
  // clause by the signed or registered amendments already effective at the reading date. Two clauses of the same
  // type and scope in one file are a conflict unless they say the same. A predecessor that may sit on a page not
  // read is not a documented predecessor: no rise, no cut, no statement of absence. Clauses are equivalent only
  // when every typed field and the quoted text coincide.
  const effectiveTexts: DocumentFolderInventory["effectiveTexts"] = [];
  const deadlines = new Map<string, {c: Clause; fileId: string}>();
  const currentCovenants: string[] = [];
  let covenantUndefined = false, covenantUnread = false;
  /** Clauses not in force, by file and clause id: the file that replaced it, "conflict", "unsigned", "future". */
  const notInForce = new Map<string, string>();
  const instruments = live.filter((f) => f.instrument !== null);
  const equivalent = (a: Clause, b: Clause) => JSON.stringify(canonical({...a, id: null, at: null})) === JSON.stringify(canonical({...b, id: null, at: null}));
  const sentence = (parts: string[]) => parts.join(" e ");
  const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);
  /** A limit is anchored when the quoted clause states the very limit it is typed with. */
  const anchoredLimit = (c: Clause) => (c.type !== "financial_covenant" && c.type !== "debt_policy")
    || [...c.statement.matchAll(ratioInText)].some((m) => new Exact(m[1]!.replace(",", ".")).eq(c.maxRatio));
  type Held = {c: Clause; from: string};
  const recovered = new Map<string, Held[]>();
  for (const [targetId, pages] of [...pagesFrom].sort(([a], [b]) => byKey(a, b))) for (const p of pages)
    for (const c of byId.get(p.fileId)!.clauses.filter((x) => x.at.page === p.page)) recovered.set(targetId, [...recovered.get(targetId) ?? [], {c, from: p.fileId}]);
  /** The instrument's clauses as read in full: its own and those of the pages its substitutes recovered. */
  const clausesOf = (f: DocumentReading): Held[] => [...f.clauses.map((c) => ({c, from: f.fileId})), ...recovered.get(f.fileId) ?? []];
  const keyOf = (c: Clause) => c.scope ? `${c.type}:${c.scope}` : c.type;
  const typeOf = (k: string) => k.split(":")[0] as Clause["type"];
  type Entry = {one: Held} | {many: Held[]};
  const entriesCache = new Map<string, Map<string, Entry>>();
  const entriesOf = (f: DocumentReading) => {
    const cached = entriesCache.get(f.fileId); if (cached) return cached;
    const groups = bucket(clausesOf(f).filter((h) => anchoredLimit(h.c)), (h) => keyOf(h.c)), out = new Map<string, Entry>();
    for (const [k, list] of groups) {
      const sorted = [...list].sort((a, b) => byKey(`${a.from}:${a.c.id}`, `${b.from}:${b.c.id}`));
      out.set(k, sorted.every((h) => equivalent(h.c, sorted[0]!.c)) ? {one: sorted[0]!} : {many: sorted});
    }
    entriesCache.set(f.fileId, out); return out;
  };
  const held = (h: Held) => `${h.from}:${h.c.id}`;
  const future = (f: DocumentReading) => f.period.start !== null && f.period.start > input.asOf;
  const clauseQuote = (h: Held) => cite(h.from, h.c.at, h.c.statement);
  // Two clauses of one type and scope in one file that say different things: declared, none in force.
  for (const f of instruments) for (const [k, e] of entriesOf(f)) if ("many" in e) {
    for (const h of e.many) notInForce.set(held(h), "conflict");
    if (typeOf(k) === "financial_covenant") covenantUndefined = true;
    add({id: `${f.fileId}-clause-conflict-${k.replace(/[_:]/g, "-")}`, code: "clause_conflict", anchor: f.fileId, sources: e.many.map((h) => src(h.from, h.c.at)),
      statement: `O documento traz ${e.many.length} cláusulas de ${clauseLabel[typeOf(k)]} com textos diferentes e nada que as separe; nenhuma foi tomada como vigente.`});
  }
  const describeBefore = (c: Clause | null, type: string) => {
    if (type === "financial_covenant") return c?.type === "financial_covenant" ? `o covenant é de ${times(c.maxRatio)}` : "não há covenant financeiro";
    if (type === "negative_pledge") return c?.type === "negative_pledge" && c.exceptionAmount !== null ? `a exceção na garantia negativa é de ${brl(c.exceptionAmount, c.scale!)}` : "não há exceção de valor na garantia negativa";
    return `a cláusula de ${clauseLabel[type as Clause["type"]]} ${c ? "tem outro texto" : "não existe"}`;
  };
  const describeChange = (c: Clause, prior: Clause | null, defined: boolean) => {
    if (c.type === "financial_covenant") {
      if (!defined) return `Fixou o covenant em ${times(c.maxRatio)}, sem texto anterior documentado`;
      const was = prior?.type === "financial_covenant" ? prior.maxRatio : null;
      const verb = was === null ? "Fixou" : new Exact(c.maxRatio).gt(was) ? "Elevou" : new Exact(c.maxRatio).lt(was) ? "Reduziu" : "Manteve";
      return `${verb} o covenant para ${times(c.maxRatio)}`;
    }
    if (c.type === "negative_pledge") {
      if (!defined) return c.exceptionAmount === null ? "fixou a garantia negativa sem exceção de valor, sem texto anterior documentado" : `fixou a exceção de ${brl(c.exceptionAmount, c.scale!)}, sem texto anterior documentado`;
      const was = prior?.type === "negative_pledge" ? prior.exceptionAmount : null;
      if (c.exceptionAmount === null) return was === null ? "manteve a garantia negativa sem exceção de valor" : "retirou a exceção de valor da garantia negativa";
      return was === null ? `criou a exceção de ${brl(c.exceptionAmount, c.scale!)} em valor agregado` : `alterou a exceção para ${brl(c.exceptionAmount, c.scale!)}`;
    }
    return `alterou a cláusula de ${clauseLabel[c.type]}`;
  };
  const describePast = (c: Clause) => c.type === "financial_covenant" ? `fixava o covenant em ${times(c.maxRatio)}`
    : c.type === "negative_pledge" ? (c.exceptionAmount === null ? "fixava a garantia negativa sem exceção de valor" : `fixava a exceção de ${brl(c.exceptionAmount, c.scale!)}`) : `alterava a cláusula de ${clauseLabel[c.type]}`;
  const sameText = (x: DocumentReading, y: DocumentReading) => {
    const a = entriesOf(x), b = entriesOf(y);
    return a.size === b.size && [...a].every(([k, e]) => {const o = b.get(k); return !!o && "one" in e && "one" in o && equivalent(e.one.c, o.one.c);});
  };
  const instrumentCriteria: VersionCriterion[] = ["guarantee", "date", "ordinal"], chainCriteria: VersionCriterion[] = ["date", "ordinal"];
  for (const ref of [...new Set(instruments.filter((f) => f.instrument!.amends === null).map((f) => f.instrument!.ref))].sort(byKey)) {
    const originals = instruments.filter((f) => f.instrument!.ref === ref && f.instrument!.amends === null);
    const amendments = instruments.filter((f) => f.instrument!.amends === ref);
    for (const o of originals.filter((f) => !binds(f.version.status))) {
      for (const h of clausesOf(o)) notInForce.set(held(h), "unsigned");
      add({id: `${o.fileId}-not-in-force`, code: "instrument_not_in_force", anchor: o.fileId, sources: [src(o.fileId)],
        statement: "Documento sem assinatura nem registro: suas cláusulas ficam como histórico e não criam obrigação nem prazo."});
    }
    for (const o of originals.filter((f) => binds(f.version.status) && future(f))) {
      for (const h of clausesOf(o)) notInForce.set(held(h), "future");
      add({id: `${o.fileId}-future`, code: "instrument_future", anchor: o.fileId, sources: [src(o.fileId)],
        statement: `Vigência a partir de ${longDate(o.period.start!)}, depois da data desta leitura: texto futuro, ainda não vigente.`});
    }
    const signed = originals.filter((f) => binds(f.version.status) && !future(f));
    const r = resolveFamily(signed, instrumentCriteria, (f) => f.period.start);
    const original = r.winner ?? (r.candidates.length > 1 && r.candidates.every((x) => sameText(x, r.candidates[0]!)) ? [...r.candidates].sort((a, b) => byKey(a.fileId, b.fileId))[0]! : null);
    if (signed.length > 1 && original) {
      const losers = signed.filter((o) => o !== original).sort((a, b) => byKey(a.fileId, b.fileId));
      for (const l of losers) {
        const k = r.eliminatedBy.get(l), reason = k ? reasonFor(original, l, k) : null;
        if (reason) superseded.set(l.fileId, {fileId: original.fileId, reason});
        for (const h of clausesOf(l)) notInForce.set(held(h), original.fileId);
        add({id: `${l.fileId}-instrument-superseded`, code: "instrument_superseded", anchor: l.fileId, sources: [src(l.fileId), src(original.fileId)],
          statement: reason ? "Versão anterior do mesmo instrumento; fica como histórico." : "Mesmo texto de outra versão do instrumento; fica como histórico."});
      }
      const first = losers.map((l) => r.eliminatedBy.get(l)).find((k) => k);
      families.push({id: `original:${ref}`, basis: "instrument", resolution: first ? reasonFor(original, losers[0]!, first) : "later_version", prevails: [original.fileId], superseded: ids(losers), sideBySide: [], highlighted: false});
    }
    if (!original) {
      for (const f of [...signed, ...amendments]) for (const h of clausesOf(f)) notInForce.set(held(h), "conflict");
      if (signed.length > 1) {
        const contenders = r.candidates;
        families.push({id: `original:${ref}`, basis: "instrument", resolution: "unresolved", prevails: [], superseded: [], sideBySide: ids(signed), highlighted: false});
        const binding = contenders.some((o) => clausesOf(o).some((h) => h.c.type === "financial_covenant" || h.c.type === "negative_pledge"));
        if (contenders.some((o) => clausesOf(o).some((h) => h.c.type === "financial_covenant"))) covenantUndefined = true;
        const first = ids(contenders)[0]!;
        add({id: `${first}-instrument-conflict`, code: "instrument_conflict", anchor: first, sources: ids(contenders).map((x) => src(x)),
          statement: `Há ${contenders.length} versões assinadas ou registradas ${of(policy[contenders[0]!.kind].noun)} sem nada no conteúdo que as ordene; o instrumento fica sem texto vigente.`,
          topic: binding ? "debt_covenant" : null, effect: binding ? "binding_limit" : null,
          decisionStatement: binding ? `${capital(policy[contenders[0]!.kind].noun)} não tem texto vigente definido: há ${contenders.length} versões assinadas ou registradas, e o conteúdo não indica qual vale.` : null});
      }
      for (const a of amendments) add({id: `${a.fileId}-not-in-force`, code: "amendment_not_in_force", anchor: a.fileId, sources: [src(a.fileId)],
        statement: "O instrumento original não tem versão vigente definida nesta data: o aditamento fica como histórico."});
      continue;
    }
    const noun = policy[original.kind].noun;
    for (const a of amendments.filter((x) => !binds(x.version.status))) {
      for (const h of clausesOf(a)) notInForce.set(held(h), "unsigned");
      add({id: `${a.fileId}-not-in-force`, code: "amendment_not_in_force", anchor: a.fileId, sources: [src(a.fileId), src(original.fileId)],
        statement: "Aditamento sem assinatura nem registro: não altera o texto vigente e fica como histórico."});
    }
    const upcoming = amendments.filter((x) => binds(x.version.status) && future(x));
    for (const a of upcoming) {
      for (const h of clausesOf(a)) notInForce.set(held(h), "future");
      add({id: `${a.fileId}-future`, code: "amendment_future", anchor: a.fileId, sources: [src(a.fileId), src(original.fileId)],
        statement: `Aditamento com vigência a partir de ${longDate(a.period.start!)}, depois da data desta leitura: texto futuro, ainda não vigente.`});
    }
    const chain = amendments.filter((x) => binds(x.version.status) && !future(x));
    const inForce = new Map<string, {f: DocumentReading; h: Held}>(), currentConflicts: {type: string; fileIds: string[]}[] = [], unreadKeys: {type: string; fileIds: string[]}[] = [];
    const unreadIn = (f: DocumentReading) => stillUnreadable(f).length > 0 || f.legibility.wholeFile !== null;
    /** Amendments with a page not read that are not shown to come before the text in force: any of them may change it. */
    const mayChange = (holder: DocumentReading) => chain.filter((x) => x !== holder && unreadIn(x)
      && (holder === original || resolveFamily([holder, x], chainCriteria, (f) => f.period.start).winner !== holder));
    const markUnread = (key: string, holder: {f: DocumentReading; h: Held}) => {
      const by = mayChange(holder.f);
      if (!by.length) return false;
      inForce.delete(key); notInForce.set(held(holder.h), "unread");
      unreadKeys.push({type: key, fileIds: ids(by)});
      if (typeOf(key) === "financial_covenant") covenantUnread = true;
      add({id: `${ids(by)[0]}-unread-${key.replace(/[_:]/g, "-")}`, code: "clause_unread", anchor: ids(by)[0]!, sources: [...by.map((x) => src(x.fileId)), src(holder.f.fileId, holder.h.c.at)], knowledge: "unread",
        statement: `Há aditamento com página não lida que pode alterar a cláusula de ${clauseLabel[typeOf(key)]}; nenhum texto vigente é afirmado para ela até a leitura.`});
      return true;
    };
    const changes: {f: DocumentReading; key: string; h: Held; current: boolean; prior: Held | null; defined: boolean; holder: DocumentReading | null}[] = [];
    const keys = [...new Set([original, ...chain].flatMap((f) => [...entriesOf(f).keys()]))].sort(byKey);
    for (const key of keys) {
      const type = typeOf(key), base = entriesOf(original).get(key);
      const setters = chain.filter((f) => entriesOf(f).has(key));
      if (!setters.length) {
        if (base && "one" in base) {const h = {f: original, h: base.one}; inForce.set(key, h); markUnread(key, h);}
        else if (base) currentConflicts.push({type: key, fileIds: [original.fileId]});
        continue;
      }
      const rk = resolveFamily(setters, chainCriteria, (f) => f.period.start);
      const contenders = rk.winner ? [rk.winner] : rk.candidates;
      const es = contenders.map((f) => entriesOf(f).get(key)!);
      const holder = es.every((e) => "one" in e) && es.every((e) => equivalent((e as {one: Held}).one.c, (es[0] as {one: Held}).one.c))
        ? [...contenders].sort((a, b) => byKey(a.fileId, b.fileId))[0]! : null;
      let unreadHolder = false;
      if (holder) {const h = {f: holder, h: (entriesOf(holder).get(key) as {one: Held}).one}; inForce.set(key, h); unreadHolder = markUnread(key, h);}
      else {
        const fileIds = ids(contenders);
        currentConflicts.push({type: key, fileIds});
        if (type === "financial_covenant") covenantUndefined = true;
        const binding = type === "financial_covenant" || type === "negative_pledge";
        add({id: `${fileIds[0]}-conflict-${key.replace(/[_:]/g, "-")}`, code: "amendment_conflict", anchor: fileIds[0]!,
          sources: contenders.flatMap((f) => {const e = entriesOf(f).get(key)!; return ("one" in e ? [e.one] : e.many).map((h) => src(h.from, h.c.at));}),
          statement: `Aditamentos sem ordem demonstrada pelo conteúdo fixam ${clauseLabel[type]} de formas diferentes; nenhum foi tomado como vigente.`,
          topic: binding ? "debt_covenant" : null, effect: binding ? "binding_limit" : null,
          decisionStatement: binding ? `A cláusula de ${clauseLabel[type]} ${of(noun)} não tem texto vigente definido: aditamentos sem ordem demonstrada pelo conteúdo a fixam de formas diferentes.` : null});
      }
      const replacedBy = holder ? holder.fileId : "conflict";
      if (base) for (const h of "one" in base ? [base.one] : base.many) if (!notInForce.has(held(h))) notInForce.set(held(h), replacedBy);
      for (const f of setters) if (f !== holder) {const e = entriesOf(f).get(key)!; for (const h of "one" in e ? [e.one] : e.many) if (!notInForce.has(held(h))) notInForce.set(held(h), replacedBy);}
      // The documented predecessor of what is in force: the version the rest of the setters resolve to, or the original.
      // Equal texts with no order between them stand in force, but no single amendment is shown as the one that changed it.
      let prior: Held | null = null, defined = rk.winner !== null;
      if (holder && rk.winner) {
        const rest = setters.filter((f) => !contenders.includes(f));
        const predecessor = rest.length ? resolveFamily(rest, chainCriteria, (f) => f.period.start).winner : original;
        const pe = predecessor ? entriesOf(predecessor).get(key) : undefined;
        if (!predecessor || (pe && "many" in pe)) defined = false;
        else if (pe && "one" in pe) prior = pe.one;
        else defined = stillUnreadable(predecessor).length === 0 && !predecessor.legibility.wholeFile;
      }
      for (const f of setters) {
        const e = entriesOf(f).get(key)!;
        if ("one" in e) changes.push({f, key, h: e.one, current: f === holder && !unreadHolder, prior: f === holder ? prior : null, defined: f === holder && !unreadHolder ? defined : false, holder: unreadHolder ? null : holder});
      }
    }
    for (const [key, v] of inForce) if (typeOf(key) === "financial_covenant" && v.h.c.type === "financial_covenant") currentCovenants.push(v.h.c.maxRatio);
    if (!chain.length && !upcoming.length) continue;
    const fileIds = [original.fileId, ...ids(chain)];
    effectiveTexts.push({instrumentRef: ref, fileIds: fileIds.length > 1 ? fileIds : [original.fileId, ...ids(upcoming)],
      clauses: [...inForce].map(([k, v]) => ({type: k, fileId: v.f.fileId, clauseId: v.h.c.id})).sort((a, b) => byKey(a.type, b.type)),
      conflicts: currentConflicts, unread: unreadKeys, future: ids(upcoming).map((id) => ({fileId: id, from: byId.get(id)!.period.start!}))});
    if (!chain.length) continue;
    families.push({id: `instrument:${ref}`, basis: "instrument", resolution: "effective_text", prevails: fileIds, superseded: [], sideBySide: [], highlighted: false});
    const touched = [...new Set(changes.map((x) => x.key))].filter((k) => typeOf(k) === "financial_covenant" || typeOf(k) === "negative_pledge");
    const originalWas = touched.map((k) => {const e = entriesOf(original).get(k);
      return e && "many" in e ? `a cláusula de ${clauseLabel[typeOf(k)]} tem textos conflitantes`
        : !e && (stillUnreadable(original).length || original.legibility.wholeFile) ? `há página não lida que pode conter a cláusula de ${clauseLabel[typeOf(k)]}` : describeBefore(e ? e.one.c : null, typeOf(k));});
    add({id: `${original.fileId}-amended`, code: "amended_original", anchor: original.fileId, sources: [src(original.fileId), ...ids(chain).map((x) => src(x))],
      statement: `${originalWas.length ? `Na versão original, ${sentence(originalWas)}. ` : ""}Ler sempre com ${chain.length > 1 ? "os aditamentos" : "o aditamento"}.`});
    for (const a of [...chain].sort((x, y) => byKey(x.fileId, y.fileId))) {
      const own = changes.filter((x) => x.f === a);
      if (!own.length) continue;
      const current = own.filter((x) => x.current), past = own.filter((x) => !x.current);
      const fate = (x: (typeof own)[number]) => x.holder ? `substituído pelo texto vigente do aditamento de ${periodText(x.holder)}`
        : unreadKeys.some((u) => u.type === x.key) ? "sem texto vigente afirmado porque há aditamento com página não lida" : "sem texto vigente por conflito com outro aditamento";
      const phrases = [...current.map((x) => describeChange(x.h.c, x.prior?.c ?? null, x.defined)), ...past.map((x) => `${describePast(x.h.c)}, ${fate(x)}`)];
      // A binding change has effect only when its predecessor is documented: both clauses quoted by anchor, or a full reading without it.
      const binding = current.filter((x) => (x.h.c.type === "financial_covenant" || x.h.c.type === "negative_pledge") && x.defined);
      const header = binding.some((x) => x.h.c.type === "financial_covenant") ? `O covenant ${of(noun)} é o do aditamento de ${periodText(a)}.` : `A garantia negativa ${of(noun)} é a do aditamento de ${periodText(a)}.`;
      const befores = binding.map((x) => ({fromOriginal: x.prior === null || x.prior.from === original.fileId || recovered.get(original.fileId)?.includes(x.prior), words: describeBefore(x.prior?.c ?? null, x.h.c.type)}));
      const priorText = befores.every((b) => b.fromOriginal) ? `A versão original diz que ${sentence(befores.map((b) => b.words))}` : `O texto anterior dizia que ${sentence(befores.map((b) => b.words))}`;
      add({id: `${a.fileId}-amendment`, code: current.length ? "amendment_in_force" : "amendment_superseded", anchor: a.fileId,
        sources: [src(a.fileId, own[0]!.h.c.at), src(original.fileId)],
        changes: own.map((x) => ({type: x.key, current: x.current, after: clauseQuote(x.h), before: x.current && x.defined && x.prior ? clauseQuote(x.prior) : null})),
        statement: `${capital(sentence(phrases))}. ${current.length ? `É o texto vigente junto com ${noun}.` : "Fica como histórico."}`,
        topic: binding.length ? "debt_covenant" : null, effect: binding.length ? "binding_limit" : null,
        decisionStatement: binding.length ? `${header} ${priorText}; o aditamento ${lower(sentence(binding.map((x) => describeChange(x.h.c, x.prior?.c ?? null, x.defined))))}. ${chain.length > 1 ? "Os textos precisam ser lidos juntos." : "As duas precisam ser lidas juntas."}` : null});
    }
  }
  // An amendment whose original is not read here (absent, only in the vault, or suspended) has no text in force:
  // its clauses create no finding and no deadline until the original is read.
  for (const a of instruments.filter((f) => f.instrument!.amends !== null && !instruments.some((o) => o.instrument!.ref === f.instrument!.amends && o.instrument!.amends === null))) {
    for (const h of clausesOf(a)) notInForce.set(held(h), "missing_source");
    const inVault = input.vault.some((v) => v.instrumentRef === a.instrument!.amends);
    add({id: `${a.fileId}-no-original`, code: "amendment_without_original", anchor: a.fileId, sources: [src(a.fileId)], knowledge: "missing_source",
      statement: inVault ? "O original deste aditamento está no sistema, mas não foi lido nesta pasta; o texto vigente não é montado sem ele."
        : "Aditamento sem o instrumento original lido na pasta ou no sistema; o texto vigente não pode ser montado sem ele."});
  }

  const prevailing = (f: DocumentReading) => !superseded.has(f.fileId);
  // A version with no winner is never read as "the" document: checks and cross-readings skip it.
  const unresolved = new Set(families.filter((x) => x.resolution === "unresolved").flatMap((x) => x.sideBySide));
  const settled = (f: DocumentReading) => prevailing(f) && !unresolved.has(f.fileId);
  const gapsOut: {need: Need; item: string; why: string; quoted: Quote | null; findingId: string | null; anchor: string | null; conditional: boolean; idPart?: string}[] = [];
  // Monthly series: a month missing between the first and the last present.
  for (const [, members] of bucket(live.filter((f) => policy[f.kind].monthly && prevailing(f) && isMonth(f)), (f) => `${f.kind}:${f.entity.primaryId}`)) {
    const present = new Set(members.map((m) => m.period.start!.slice(0, 7))), sorted = [...present].sort();
    const missing = monthsBetween(`${sorted[0]}-01`, `${sorted[sorted.length - 1]}-01`).filter((m) => !present.has(m));
    if (!missing.length) continue;
    const latestMonth = sorted.at(-1)!, latest = members.filter((m) => m.period.start!.startsWith(latestMonth)).sort((a, b) => byKey(a.fileId, b.fileId))[0]!;
    const names = missing.map((m) => monthName(`${m}-01`));
    const id = `${latest.fileId}-series-gap`;
    add({id, code: "series_gap", anchor: latest.fileId, sources: ids(members).map((x) => src(x)),
      statement: `Falta o ${policy[latest.kind].label.toLowerCase()} de ${names.join(", ")}: a série não fecha mês a mês sem ${missing.length > 1 ? "eles" : "ele"}.`});
    missing.forEach((m, n) => gapsOut.push({need: "monthly_series", item: `${policy[latest.kind].label} de ${names[n]}`, why: "fechar a série mês a mês e conferir o gerencial do mesmo período",
      quoted: null, findingId: id, anchor: latest.fileId, conditional: false, idPart: `${m.slice(0, 4)}-${Number(m.slice(5, 7))}`}));
  }

  // Identity checks: the only arithmetic the method does.
  const identityChecks: DocumentFolderInventory["identityChecks"] = [];
  for (const f of live.filter((x) => x.debtTable !== null && settled(x))) {
    const t = f.debtTable!, drawn = t.lines.reduce((s, l) => s.plus(inReais(l.drawn, t.scale)), new Exact(0));
    const reported = inReais(t.reportedTotal, t.scale), counted = t.lines.reduce((s, l) => s.plus(inReais(l.counted, t.scale)), new Exact(0));
    // A limit explains the difference only when the lines as counted add up to the reported total.
    const atLimit = counted.eq(reported) ? t.lines.filter((l) => l.limit !== null && !new Exact(l.counted).eq(l.drawn) && new Exact(l.counted).eq(l.limit)) : [];
    const matches = drawn.eq(reported);
    identityChecks.push({id: `${f.fileId}-reported-total`, kind: "reported_total", fileIds: [f.fileId], status: matches ? "matches" : "differs",
      reported: reported.toFixed(), recomposed: drawn.toFixed(), currency: input.currency, reason: matches ? null : atLimit.length ? "unused_limit_counted" : "not_recomposed"});
    if (matches) continue;
    const drawnShown = brl(drawn.div(t.scale).toFixed(), t.scale);
    if (atLimit.length) {
      const unused = atLimit.every((l) => new Exact(l.drawn).eq(0));
      add({id: `${f.fileId}-debt-total`, code: "total_includes_unused_limit", anchor: f.fileId, sources: [src(f.fileId, t.at)],
        statement: `Soma ${brl(t.reportedTotal, t.scale)} porque ${atLimit.map((l) => `${lineLabel[l.lineKind]} entra pelo limite (${brl(l.limit!, t.scale)})`).join(" e ")}; ${unused ? "o saldo utilizado é zero" : "o saldo utilizado é menor"}. Dívida em ${periodText(f)}: ${drawnShown}.`,
        topic: "debt_position", effect: "figure_correction",
        decisionStatement: `A dívida em ${periodText(f)} é de ${drawnShown}, não ${brl(t.reportedTotal, t.scale)}. A tabela soma o limite ${atLimit.map((l) => of(lineLabel[l.lineKind])).join(" e ")}, ${unused ? "que está sem uso" : "acima do saldo usado"}.`});
    } else {
      add({id: `${f.fileId}-debt-total`, code: "total_not_recomposed", anchor: f.fileId, sources: [src(f.fileId, t.at)],
        statement: `O total informado de ${brl(t.reportedTotal, t.scale)} não fecha com as linhas, que somam ${drawnShown} de saldo utilizado.`, topic: "debt_position", effect: "figure_correction",
        decisionStatement: `A tabela de dívida de ${periodText(f)} não fecha: o total informado é ${brl(t.reportedTotal, t.scale)} e as linhas somam ${drawnShown}.`});
    }
  }
  for (const report of live.filter((f) => f.kind === "management_report" && settled(f) && f.period.start && f.period.end && figure(f, "ebitda"))) {
    const window = monthsBetween(report.period.start!, report.period.end!);
    const inWindow = (f: DocumentReading) => policy[f.kind].monthly && prevailing(f) && isMonth(f) && f.entity.primaryId === report.entity.primaryId && window.includes(f.period.start!.slice(0, 7));
    // A month with versions and no winner blocks the sum: neither version is counted, and never both.
    const undecided = [...new Set(live.filter((f) => inWindow(f) && unresolved.has(f.fileId)).map((f) => f.period.start!.slice(0, 7)))].sort();
    const series = live.filter((f) => inWindow(f) && !unresolved.has(f.fileId)).sort((a, b) => byKey(a.period.start!, b.period.start!));
    const missing = window.filter((m) => !series.some((f) => f.period.start!.startsWith(m)) && !undecided.includes(m));
    const withoutFigure = series.filter((f) => !figure(f, "ebitda"));
    const r = figure(report, "ebitda")!, reported = inReais(r.value, r.scale);
    if (undecided.length || missing.length || withoutFigure.length) {
      identityChecks.push({id: `${report.fileId}-months`, kind: "period_against_months", fileIds: [report.fileId, ...series.map((f) => f.fileId)], status: "not_run",
        reported: reported.toFixed(), recomposed: null, currency: input.currency,
        reason: undecided.length ? `unresolved_versions:${undecided.join(",")}` : missing.length ? `missing_months:${missing.join(",")}` : "month_without_figure"});
      continue;
    }
    const sum = series.reduce((s, f) => {const x = figure(f, "ebitda")!; return s.plus(inReais(x.value, x.scale));}, new Exact(0));
    identityChecks.push({id: `${report.fileId}-months`, kind: "period_against_months", fileIds: [report.fileId, ...series.map((f) => f.fileId)],
      status: sum.eq(reported) ? "matches" : "differs", reported: reported.toFixed(), recomposed: sum.toFixed(), currency: input.currency, reason: null});
  }

  for (const f of live) {
    const scales = [...new Set(f.units.map((u) => u.scale))];
    if (scales.length > 1) add({id: `${f.fileId}-units`, code: "mixed_units", anchor: f.fileId, sources: f.units.map((u) => src(f.fileId, {page: null, section: u.section})),
      statement: `Unidades misturadas: o mesmo arquivo tem abas em ${scales.map((x) => scaleLabel[x]).join(" e em ")}.`});
    if (policy[f.kind].forecast && settled(f) && f.period.end !== null && f.period.end < input.asOf) {
      add({id: `${f.fileId}-stale`, code: "stale_forecast", anchor: f.fileId, sources: [src(f.fileId)],
        statement: `${f.version.lastUpdated ? `Última atualização em ${monthName(f.version.lastUpdated)}; ` : ""}cobre só até ${longDate(f.period.end)}, antes da data desta leitura.`});
    }
    for (const p of stillUnreadable(f)) {
      const id = `${f.fileId}-unreadable-p${p.page}`;
      const quoted = p.expectedContent !== null ? cite(f.fileId, p.expectedFrom!, p.expectedContent) : null;
      add({id, code: "page_unreadable", anchor: f.fileId, sources: [src(f.fileId, {page: p.page, section: null})],
        statement: `A página ${p.page} não pôde ser lida${quoted ? `; a página ${quoted.page} do próprio documento indica o que ela traz` : ""}. Pedir cópia legível.`, quoted});
      gapsOut.push({need: "reading_substitute", item: `Página ${p.page} legível ${of(policy[f.kind].noun)}`,
        why: quoted ? `o próprio documento indica, na página ${quoted.page}, conteúdo que não foi lido` : "conteúdo não lido", quoted, findingId: id, anchor: f.fileId, conditional: false});
    }
    if (f.legibility.wholeFile) add({id: `${f.fileId}-unreadable`, code: "file_unreadable", anchor: f.fileId, sources: [src(f.fileId)],
      statement: "Não foi possível extrair conteúdo útil; pedir o arquivo original se for relevante."});
    for (const o of f.observations.filter((x) => x.topic !== "revision_note")) add({id: `${f.fileId}-${o.id}`, code: "observation", anchor: f.fileId, sources: [src(f.fileId, o.at)],
      statement: "Registrado no documento.", quoted: cite(f.fileId, o.at, o.statement)});
    // Clauses: only those in force create an effect or a deadline; the others stay as history.
    const own = clausesOf(f);
    if (f.instrument === null) for (const [k, list] of bucket(own.filter((h) => anchoredLimit(h.c)), (h) => keyOf(h.c))) if (list.some((h) => !equivalent(h.c, list[0]!.c))) {
      // Two clauses of one type and scope in one document that say different things: none is in force.
      for (const h of list) notInForce.set(held(h), "conflict");
      add({id: `${f.fileId}-clause-conflict-${k.replace(/[_:]/g, "-")}`, code: "clause_conflict", anchor: f.fileId, sources: list.map((h) => src(h.from, h.c.at)),
        statement: `O documento traz ${list.length} cláusulas de ${clauseLabel[typeOf(k)]} com textos diferentes e nada que as separe; nenhuma foi tomada como vigente.`});
    }
    const docBinds = binds(f.version.status), docFuture = f.period.start !== null && f.period.start > input.asOf;
    if (f.instrument === null && docBinds && docFuture && own.length) add({id: `${f.fileId}-future`, code: "clause_future", anchor: f.fileId, sources: own.map(({c, from}) => src(from, c.at)), knowledge: "future",
      statement: `Documento com data de ${longDate(f.period.start!)}, depois da data desta leitura: suas cláusulas ficam como texto futuro, sem efeito atual.`});
    if (f.instrument === null && !docBinds && own.length) add({id: `${f.fileId}-not-in-force`, code: "clause_not_in_force", anchor: f.fileId, sources: own.map(({c, from}) => src(from, c.at)),
      statement: "Documento sem assinatura nem registro: suas cláusulas ficam como histórico e não criam obrigação nem prazo."});
    for (const {c, from} of own) {
      const state = notInForce.get(`${from}:${c.id}`);
      // A limit typed without its own words is an observation: quoted, with no effect.
      if (!anchoredLimit(c)) {
        add({id: `${f.fileId}-${from === f.fileId ? "" : `${from}-`}${c.id}-unanchored`, code: "observation", anchor: f.fileId, sources: [src(from, c.at)], quoted: cite(from, c.at, c.statement),
          statement: `Cláusula de ${clauseLabel[c.type]} sem o texto do limite; fica como observação, sem efeito.`});
        continue;
      }
      if (c.type === "financial_covenant" || c.type === "negative_pledge") continue;
      if (state && byId.has(state)) {
        add({id: `${f.fileId}-${from === f.fileId ? "" : `${from}-`}${c.id}-superseded`, code: "clause_superseded", anchor: f.fileId, sources: [src(from, c.at), src(state)],
          statement: `Cláusula substituída pelo aditamento de ${periodText(byId.get(state)!)}; fica como histórico.`, quoted: cite(from, c.at, c.statement)});
        continue;
      }
      if (state || !docBinds || docFuture) continue;
      const base = {id: `${f.fileId}-${from === f.fileId ? "" : `${from}-`}${c.id}`, code: "clause" as const, anchor: f.fileId, sources: [src(from, c.at)], quoted: cite(from, c.at, c.statement)};
      if (c.type === "assignment_prohibition") add({...base, statement: "Limita qualquer financiamento com cessão dessa carteira.", topic: "receivables_assignment", effect: "collateral_restriction",
        decisionStatement: `Os recebíveis ${of(policy[f.kind].noun)} não podem ser cedidos sem anuência da contraparte. O contrato veda a cessão${c.receivablesShare ? `; a contraparte responde por ${percent(c.receivablesShare)} da carteira` : ""}. Isso reduz a carteira disponível para qualquer financiamento com cessão.`});
      else if (c.type === "auto_renewal") deadlines.set(base.id, {c, fileId: f.fileId}), add({...base, statement: `Aviso até ${longDate(c.noticeDeadline)} para renegociar preço ou não renovar.`, topic: "supplier_contract", effect: "deadline",
        decisionStatement: `${capital(policy[f.kind].noun)} renova sozinho em ${monthName(c.termEnd)}. Para renegociar preço ou não renovar, o aviso precisa sair até ${longDate(c.noticeDeadline)}.`});
      else if (c.type === "debt_policy") {
        const lowest = [...currentCovenants].sort((a, b) => new Exact(a).cmp(b))[0];
        const tighter = lowest !== undefined && new Exact(c.maxRatio).lt(lowest);
        const against = covenantUnread || (covenantUndefined && lowest === undefined) ? (covenantUnread ? ", e o covenant vigente não pôde ser lido integralmente." : ", e o covenant vigente não está definido.") : lowest === undefined ? "." : tighter ? `, mais restritiva que o covenant vigente de ${times(lowest)}.` : `, igual ou acima do covenant vigente de ${times(lowest)}.`;
        add({...base, statement: `Política de no máximo ${times(c.maxRatio)}${against}`, topic: "debt_policy", effect: "policy_limit",
          decisionStatement: `Há uma política de endividamento aprovada pelo conselho. ${capital(policy[f.kind].noun)} de ${periodText(f)} fixa dívida líquida de no máximo ${times(c.maxRatio)} o EBITDA${lowest === undefined || covenantUnread ? against : tighter ? `, abaixo do covenant vigente de ${times(lowest)}. Entre os limites lidos, é o mais restritivo.` : `, não abaixo do covenant vigente de ${times(lowest)}.`}`});
      } else add({...base, statement: from === f.fileId ? "Cláusula lida no documento." : `Cláusula lida na cópia legível da página ${c.at.page}.`});
    }
  }

  // Subsidiary inside the consolidated statements of its parent; the entity names come from the registry.
  for (const f of live.filter((x) => x.kind === "annual_financial_statements" && settled(x) && x.entity.primaryId && registry.get(x.entity.primaryId)?.parentId)) {
    const sub = registry.get(f.entity.primaryId!)!, parent = registry.get(sub.parentId!)!;
    if (!live.some((x) => x.kind === "annual_financial_statements" && x.entity.primaryId === parent.id)) continue;
    const cash = figure(f, "cash"), id = `${f.fileId}-subsidiary`;
    add({id, code: "subsidiary_in_consolidated", anchor: f.fileId, sources: [src(f.fileId, cash?.at)],
      statement: `A consolidada inclui a ${sub.label}; a análise de crédito da devedora precisa do individual.${cash ? ` O caixa da controlada (${brl(cash.value, cash.scale)}) só sobe à controladora por dividendos ou mútuo.` : ""}`,
      topic: "group_perimeter", effect: "perimeter",
      decisionStatement: `A controlada ${sub.label} entra no consolidado.${cash ? ` O caixa dela, ${brl(cash.value, cash.scale)}, só chega à controladora por dividendo ou mútuo.` : ""}`});
    if (f.version.status !== "audited") gapsOut.push({need: "group_perimeter", item: `Demonstrações auditadas da ${sub.label}, se existirem`, why: "perímetro da devedora e caixa disponível na controladora", quoted: null, findingId: id, anchor: f.fileId, conditional: true});
  }
  for (const f of live.filter((x) => x.kind === "appraisal_report" && x.asset)) {
    if (live.some((x) => x.kind === "property_registry" && x.asset?.id === f.asset!.id)) continue;
    const v = figure(f, "appraised_value"), id = `${f.fileId}-registry`;
    add({id, code: "appraisal_without_registry", anchor: f.fileId, sources: [src(f.fileId, v?.at)],
      statement: `${v ? `Valor de ${brl(v.value, v.scale)}. ` : ""}Sem matrícula atualizada não dá para saber se o imóvel avaliado está livre de ônus.`});
    gapsOut.push({need: "real_collateral", item: "Matrícula atualizada do imóvel avaliado no laudo", why: "saber se o imóvel está livre para uma garantia", quoted: null, findingId: id, anchor: f.fileId, conditional: false});
  }
  // A figure cited outside the statements, read against the prevailing audited statements of the same entity and period.
  for (const f of live.filter((x) => policy[x.kind].group !== "statements")) {
    for (const x of f.figures.filter((y) => y.metric === "revenue")) {
      const statements = live.filter((s) => s.kind === "annual_financial_statements" && settled(s) && s.version.status === "audited" && s.entity.primaryId === f.entity.primaryId && s.period.start === f.period.start && s.period.end === f.period.end);
      if (statements.length !== 1) continue;
      const st = statements[0]!, gross = figure(st, "gross_revenue"), net = figure(st, "net_revenue"), cited = inReais(x.value, x.scale);
      if (net && cited.eq(inReais(net.value, net.scale))) continue;
      add({id: `${f.fileId}-${x.id}`, code: "figure_basis_differs", anchor: f.fileId, sources: [src(f.fileId, x.at), src(st.fileId, (gross ?? net)?.at ?? null)],
        statement: gross && cited.eq(inReais(gross.value, gross.scale))
          ? `Cita receita de ${brl(x.value, x.scale)}, que é a receita bruta${net ? `; a líquida das demonstrações é ${brl(net.value, net.scale)}` : ""}.`
          : `Cita receita de ${brl(x.value, x.scale)}, que não coincide com a bruta nem com a líquida das demonstrações.`});
    }
  }
  for (const [dup, first] of duplicateOf) if (!suspended.has(dup)) add({id: `${dup}-duplicate`, code: "duplicate", anchor: dup, sources: [src(dup), src(first)], statement: "Mesmo conteúdo, mesmo hash."});
  // Projection: a forecast that does not reach the reading date, or none at all.
  const forecasts = live.filter((f) => policy[f.kind].forecast && settled(f));
  const stale = findings.find((x) => x.code === "stale_forecast");
  if (!forecasts.length || stale) gapsOut.push({need: "liquidity_projection", item: "Projeção ou fluxo de caixa de 13 semanas atualizado", why: `liquidez a partir de ${monthName(input.asOf)}${stale ? "; o fluxo da pasta não chega a essa data" : ""}`,
    quoted: null, findingId: stale?.id ?? null, anchor: stale?.anchor ?? null, conditional: false});

  // Partition by entity first when the folder spans more than one group or an entity outside the registry.
  const partitionOf = (f: DocumentReading) => f.entity.primaryId === null ? "nao-identificada" : registry.get(f.entity.primaryId)?.groupId ?? f.entity.primaryId;
  const unregistered = [...new Set(live.flatMap((f) => f.entity.primaryId !== null && !registry.has(f.entity.primaryId) ? [f.entity.primaryId] : []))];
  const partitionByEntity = new Set(live.filter((f) => f.entity.primaryId !== null).map(partitionOf)).size > 1 || unregistered.length > 0;

  // Rows, in arrival order. A suspended hash is shown without its reading.
  const rows: Row[] = documents.map((own) => {
    const conflicted = suspended.has(own.fileId);
    const f = readingOf(own), dup = duplicateOf.get(own.fileId) ?? null, sup = superseded.get(own.fileId) ?? null, unread = conflicted ? [] : stillUnreadable(own).map((p) => p.page);
    const read = conflicted ? "conflicted" as const : own.legibility.wholeFile ? "unreadable" as const : unread.length ? "partial" as const : "complete" as const;
    const inVault = vaultByHash.get(own.sha256) ?? null;
    const label = conflicted ? "leitura em conflito" : dup ? "duplicado" : read === "unreadable" ? "ilegível" : [
      read === "partial" ? `lida, exceto ${unread.length === 1 ? `a página ${unread[0]}, ilegível` : `as páginas ${unread.join(", ")}, ilegíveis`}` : "lida",
      ...sup ? [sup.reason === "audited_over_draft" ? "superada pela auditada" : sup.reason === "later_version" ? `superada pela v${byId.get(sup.fileId)!.version.ordinal}` : sup.reason === "higher_assurance" ? "superada pela versão de maior asseguração" : "superada"] : [],
      ...inVault ? ["já estava no cofre"] : []].join("; ");
    const entityOf = f.entity.primaryId ? registry.get(f.entity.primaryId) : undefined;
    if (conflicted) return {fileId: own.fileId, fileName: own.fileName, sha256: own.sha256, order: order.get(own.fileId)!, partition: partitionByEntity ? "nao-identificada" : null,
      group: "other" as const, groupLabel: groupLabel.other, kind: "unidentified" as const, description: "Leitura em conflito: refazer a leitura", entity: "não definida", period: "não definido",
      version: "não definida", status: null, situation: {read, unreadablePages: [], pagesFrom: [], duplicateOf: dup, supersededBy: null, sideBySideWith: [], inVault},
      situationLabel: label, findingIds: [], validated: false as const};
    return {fileId: own.fileId, fileName: own.fileName, sha256: own.sha256, order: order.get(own.fileId)!, partition: partitionByEntity ? partitionOf(f) : null,
      group: policy[f.kind].group, groupLabel: groupLabel[policy[f.kind].group], kind: f.kind,
      // Rule for a copy: it carries the reading of the document it repeats (same hash, same content). Its row names that
      // document and shows the economic group as entity, since the full reading is on the original's row. The name is shown, never read.
      description: dup ? `Cópia idêntica de ${byId.get(dup)!.fileName}` : f.description, entity: dup ? entityOf?.groupLabel ?? f.entity.label : f.entity.label, period: f.period.label,
      version: dup ? "duplicado exato" : f.version.label, status: f.version.status,
      situation: {read, unreadablePages: unread, pagesFrom: pagesFrom.get(own.fileId) ?? [], duplicateOf: dup, supersededBy: sup, sideBySideWith: sideBySide.get(own.fileId) ?? [], inVault},
      situationLabel: label, findingIds: [], validated: false as const};
  });

  // A later call: what the prior inventory said and no longer holds is resolved by what arrived, never dropped.
  const newFiles = input.prior ? input.files.filter((f) => !input.prior!.inventory.rows.some((r) => r.fileId === f.fileId) && f.substitutesPages === null).map((f) => f.fileId) : [];
  if (input.prior) {
    if (inventoryFingerprint(input.prior.inventory) !== input.prior.fingerprint) throw new Error("document_inventory_prior_mismatch");
    for (const p of input.prior.inventory.findings) {
      if (findings.some((x) => x.id === p.id)) continue;
      const by = p.code === "page_unreadable" ? (pagesFrom.get(p.anchor) ?? []).filter((x) => p.sources.some((s) => s.page === x.page)).map((x) => x.fileId)
        : p.code === "series_gap" ? newFiles.filter((id) => policy[byId.get(id)!.kind].monthly) : [];
      if (!by.length) throw new Error("document_inventory_finding_dropped");
      findings.push({...p, status: "resolved", resolvedBy: [...new Set([...p.resolvedBy, ...by])]});
    }
  }
  // Ordered by id, so a finding resolved in a later turn keeps the row's bytes.
  for (const r of rows) r.findingIds = findings.filter((x) => x.anchor === r.fileId).map((x) => x.id).sort(byKey);

  // Decisions in course: which findings move them, in order of effect; ties by the content's own ids, never by arrival.
  const decisions = input.mode === "organize_for_debt" ? [{id: "discussao-divida", label: "Discussão da dívida", kind: "debt_discussion" as const}, ...input.decisions] : input.decisions;
  const effectful = findings.filter((x) => x.effect !== null && x.status === "open");
  const tie = (a: Finding, b: Finding) => byKey(a.id, b.id);
  const decisionFindings = input.mode === "organize_only" || !decisions.length ? null : effectful
    .map((x) => ({x, decisionIds: decisions.filter((d) => purposes[d.kind].topics.includes(x.topic!)).map((d) => d.id)}))
    .filter((e) => e.decisionIds.length)
    .sort((a, b) => effects.indexOf(a.x.effect!) - effects.indexOf(b.x.effect!) || tie(a.x, b.x))
    .map((e, n) => ({rank: n + 1, findingId: e.x.id, decisionIds: e.decisionIds, effect: e.x.effect!, statement: e.x.decisionStatement!, sources: e.x.sources}));
  const generalFindings = input.mode === "organize_only" || decisions.length ? null : [...effectful]
    .sort((a, b) => generalOrder.indexOf(a.effect!) - generalOrder.indexOf(b.effect!) || tie(a, b))
    .map((x, n) => ({rank: n + 1, findingId: x.id, effect: x.effect!, statement: x.decisionStatement!}));

  // Gaps by purpose: what each decision needs, or the likely uses when none is in course.
  const uses = input.mode === "organize_only" ? [] : decisions.length ? decisions.map((d) => ({id: d.id, needs: purposes[d.kind].needs}))
    : (["debt_analysis", "projection", "bank_material"] as const).map((u) => ({id: u.replace("_", "-"), needs: purposes[u].needs}));
  const gaps: DocumentFolderInventory["gaps"] = gapsOut
    .map((g) => ({g, purposes: [...inventoryNeeds.includes(g.need) ? ["inventario"] : [], ...uses.filter((u) => u.needs.includes(g.need)).map((u) => u.id)]}))
    .filter((e) => e.purposes.length)
    .sort((a, b) => needs.indexOf(a.g.need) - needs.indexOf(b.g.need) || byKey(`${a.g.anchor}${a.g.idPart ?? ""}`, `${b.g.anchor}${b.g.idPart ?? ""}`))
    .map(({g, purposes: p}) => ({id: `${g.need.replace(/_/g, "-")}-${g.anchor ?? "pasta"}${g.idPart ? `-${g.idPart}` : ""}`,
      need: g.need, item: g.item, why: g.why, quoted: g.quoted, purposes: p, findingId: g.findingId, conditional: g.conditional, status: "open" as const, resolvedBy: [] as string[]}));
  if (input.prior) for (const p of input.prior.inventory.gaps) {
    if (gaps.some((g) => g.id === p.id)) continue;
    const by = findings.find((x) => x.id === p.findingId && x.status === "resolved")?.resolvedBy ?? [];
    if (!by.length) throw new Error("document_inventory_gap_dropped");
    gaps.push({...p, status: "resolved", resolvedBy: by});
  }

  // Questions only the person knows: whether a superseded draft went to a third party, and the perimeter.
  const answered = new Map(input.informed.map((i) => [i.questionId, i.id]));
  const outside = live.filter((f) => f.entity.primaryId !== null && unregistered.includes(f.entity.primaryId)).map((f) => f.fileId).sort(byKey);
  const candidates = [
    ...unregistered.length ? [{id: "perimetro", fileIds: outside, findingId: null,
      text: unregistered.length > 1 ? `Há documentos de ${unregistered.length} empresas que não estão no cadastro da companhia. Elas entram no perímetro deste trabalho?`
        : "Há documentos de uma empresa que não está no cadastro da companhia. Ela entra no perímetro deste trabalho?"}] : [],
    ...findings.filter((x) => x.code === "draft_superseded" && policy[byId.get(x.anchor)!.kind].external).map((x) => {const f = byId.get(x.anchor)!;
      return {id: `circulacao-${f.fileId}`, fileIds: [f.fileId], findingId: x.id,
        text: `A minuta ${of(policy[f.kind].noun)} de ${periodText(f)} foi enviada a algum banco? Se foi, vale mandar a versão auditada com uma nota sobre a diferença.`};}),
  ];
  for (const i of input.informed) if (!candidates.some((c) => c.id === i.questionId)) throw new Error("document_inventory_informed_without_question");
  const questions = candidates.slice(0, 2).map((c) => ({...c, status: answered.has(c.id) ? "answered" as const : "open" as const, answeredBy: answered.get(c.id) ?? null}));

  // Deadlines come only from clauses in force.
  const followUps: DocumentFolderInventory["followUps"] = [
    ...findings.filter((x) => x.code === "clause" && x.status === "open" && x.effect === "deadline").flatMap((x) => {
      const d = deadlines.get(x.id), f = d ? byId.get(d.fileId)! : null, c = d?.c;
      return f && c?.type === "auto_renewal" && c.noticeDeadline >= input.asOf
        ? [{kind: "notice_deadline" as const, date: c.noticeDeadline, fileId: f.fileId, clauseId: c.id, decisionIds: decisions.filter((d) => purposes[d.kind].topics.includes("supplier_contract")).map((d) => d.id), scheduled: false as const}] : [];
    }),
    ...effectiveTexts.map((t) => ({kind: "effective_text" as const, instrumentRef: t.instrumentRef, fileIds: t.fileIds}))]
    .sort((a, b) => byKey(JSON.stringify(a), JSON.stringify(b)));

  if (input.mode === "organize_for_debt") for (const fam of families) if (fam.basis === "instrument" && fam.prevails.some((id) => policy[byId.get(id)!.kind].group === "debt")) fam.highlighted = true;
  const groupOrder: Group[] = input.mode === "organize_for_debt" ? ["debt", ...groupIds.filter((g) => g !== "debt")] : [...groupIds];
  const partitions = partitionByEntity ? [...new Set(rows.map((r) => r.partition!))].sort((a, b) => (a === "nao-identificada" ? 1 : 0) - (b === "nao-identificada" ? 1 : 0)
    || rows.findIndex((r) => r.partition === a) - rows.findIndex((r) => r.partition === b)) : [null];
  const groups = partitions.flatMap((p) => groupOrder.flatMap((g) => {const list = rows.filter((r) => r.partition === p && r.group === g).map((r) => r.fileId); return list.length ? [{partition: p, group: g, label: groupLabel[g], fileIds: list}] : [];}));

  let update: DocumentFolderInventory["update"] = null;
  if (input.prior) {
    const affected = substituted;
    const prior = new Map(input.prior.inventory.rows.map((r) => [r.fileId, r]));
    for (const id of prior.keys()) if (!rows.some((r) => r.fileId === id)) throw new Error("document_inventory_prior_row_dropped");
    const changed = rows.filter((r) => prior.has(r.fileId) && JSON.stringify(canonical(r)) !== JSON.stringify(canonical(prior.get(r.fileId))));
    if (changed.some((r) => !affected.has(r.fileId))) throw new Error("document_inventory_unaffected_row_changed");
    // Untouched rows are the prior bytes, not a recomputation of them.
    for (let n = 0; n < rows.length; n++) if (prior.has(rows[n]!.fileId) && !affected.has(rows[n]!.fileId)) rows[n] = prior.get(rows[n]!.fileId)!;
    const priorFindings = new Set(input.prior.inventory.findings.map((x) => x.id)), priorGaps = new Set(input.prior.inventory.gaps.filter((g) => g.status === "open").map((g) => g.id));
    update = {priorFingerprint: input.prior.fingerprint, rowsUpdated: changed.map((r) => r.fileId), rowsAdded: newFiles,
      rowsPreserved: rows.filter((r) => prior.has(r.fileId) && !changed.includes(r)).length,
      findingsResolved: findings.filter((x) => x.status === "resolved" && input.prior!.inventory.findings.some((p) => p.id === x.id && p.status === "open")).map((x) => x.id),
      findingsAdded: findings.filter((x) => !priorFindings.has(x.id)).map((x) => x.id),
      gapsResolved: gaps.filter((g) => g.status === "resolved" && priorGaps.has(g.id)).map((g) => g.id),
      questionsAnswered: questions.filter((q) => q.status === "answered" && input.prior!.inventory.questions.some((p) => p.id === q.id && p.status === "open")).map((q) => q.id)};
  }

  const out = {schemaVersion: "document-folder-inventory.v1" as const, version: documentFolderInventoryVersion, asOf: input.asOf, mode: input.mode, partitionByEntity,
    // Everything but the rows is ordered by content, so the arrival of the files never reorders what the folder says.
    rows, groups, families: families.sort((a, b) => byKey(a.id, b.id)), effectiveTexts: effectiveTexts.sort((a, b) => byKey(a.instrumentRef, b.instrumentRef)),
    findings, readingConflicts, decisionFindings, generalFindings, identityChecks: identityChecks.sort((a, b) => byKey(a.id, b.id)), gaps, questions,
    informed: input.informed.map((i) => ({...i, origin: "informed" as const})), followUps,
    counts: {files: rows.length, duplicates: rows.filter((r) => r.situation.duplicateOf).length, incompleteReadings: rows.filter((r) => r.situation.read !== "complete").length,
      superseded: rows.filter((r) => r.situation.supersededBy).length, inVault: rows.filter((r) => r.situation.inVault).length,
      withFinding: rows.filter((r) => r.findingIds.length).length, pageSubstitutes: substitutes.length},
    update};
  return documentFolderInventoryOutputSchema.parse(out);
}
