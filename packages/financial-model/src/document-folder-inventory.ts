import {createHash} from "node:crypto";
import Decimal from "decimal.js";
import {z} from "zod";

/** Organizing a folder is not financial math: this kernel resolves identity, versions, readings and
 * findings over typed readings of each file. The only arithmetic is the identity check the method
 * names (a reported total against its own lines, a period against its months), exact in Decimal. */
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
const at = z.strictObject({page: page.nullable(), section: text.nullable()})
  .refine((a) => a.page !== null || a.section !== null, "A reading names the page or the section it came from");

export const documentKinds = ["annual_financial_statements", "auditor_management_letter", "trial_balance", "management_report", "budget",
  "cash_flow_forecast", "debt_schedule", "debenture_indenture", "bank_credit_note", "development_bank_financing", "customer_contract",
  "supplier_contract", "board_minutes", "shareholders_minutes", "receivables_aging", "appraisal_report", "property_registry",
  "institutional_presentation", "invoice", "unidentified"] as const;
type Kind = (typeof documentKinds)[number];
export const documentStatuses = ["audited", "draft", "signed", "registered", "approved", "working_revision", "closed", "management", "final", "outdated", "marketing", "image"] as const;
const groupIds = ["statements", "management", "debt", "contracts", "governance", "receivables", "assets", "other"] as const;
type Group = (typeof groupIds)[number];
const groupLabel: Record<Group, string> = {statements: "Demonstrações", management: "Gerencial", debt: "Dívida", contracts: "Contratos",
  governance: "Governança", receivables: "Carteira", assets: "Ativos", other: "Outros"};
/** Content kind decides the subject and how versions relate: by period (the same period read twice),
 * by position (the latest position replaces the earlier one), by instrument (amendments join the original). */
const policy: Record<Kind, {group: Group; family: "period" | "position" | "instrument" | "single"; monthly?: true; external?: true; forecast?: true; label: string}> = {
  annual_financial_statements: {group: "statements", family: "period", external: true, label: "Demonstrações"},
  auditor_management_letter: {group: "statements", family: "period", label: "Carta de controles"},
  trial_balance: {group: "management", family: "period", monthly: true, label: "Balancete"},
  management_report: {group: "management", family: "period", label: "Relatório gerencial"},
  budget: {group: "management", family: "period", label: "Orçamento"},
  cash_flow_forecast: {group: "management", family: "position", forecast: true, label: "Fluxo de caixa"},
  debt_schedule: {group: "debt", family: "position", label: "Tabela de dívida"},
  debenture_indenture: {group: "debt", family: "instrument", label: "Escritura"},
  bank_credit_note: {group: "debt", family: "instrument", label: "Cédula de crédito"},
  development_bank_financing: {group: "debt", family: "instrument", label: "Financiamento"},
  customer_contract: {group: "contracts", family: "instrument", label: "Contrato"},
  supplier_contract: {group: "contracts", family: "instrument", label: "Contrato"},
  board_minutes: {group: "governance", family: "single", label: "Ata"},
  shareholders_minutes: {group: "governance", family: "single", label: "Ata"},
  receivables_aging: {group: "receivables", family: "position", label: "Carteira"},
  appraisal_report: {group: "assets", family: "single", label: "Laudo"},
  property_registry: {group: "assets", family: "single", label: "Matrícula"},
  institutional_presentation: {group: "other", family: "single", label: "Apresentação"},
  invoice: {group: "other", family: "single", label: "Nota fiscal"},
  unidentified: {group: "other", family: "single", label: "Documento"},
};
const assurance = (s: (typeof documentStatuses)[number]) => s === "audited" ? 3 : s === "draft" ? 1 : 2;

const clause = z.discriminatedUnion("type", [
  z.strictObject({type: z.literal("financial_covenant"), id: key, at, statement: text, metric: z.literal("net_debt_to_ebitda"), maxRatio: ratio}),
  z.strictObject({type: z.literal("negative_pledge"), id: key, at, statement: text, exceptionAmount: amount.nullable(), scale: scale.nullable()}),
  z.strictObject({type: z.literal("assignment_prohibition"), id: key, at, statement: text, counterparty: text, receivablesShare: ratio.nullable()}),
  z.strictObject({type: z.literal("auto_renewal"), id: key, at, statement: text, termEnd: date, noticeDeadline: date}),
  z.strictObject({type: z.literal("payment_term"), id: key, at, statement: text, days: z.number().int().min(0).max(3650)}),
  z.strictObject({type: z.literal("debt_policy"), id: key, at, statement: text, metric: z.literal("net_debt_to_ebitda"), maxRatio: ratio}),
  z.strictObject({type: z.literal("collateral_top_up"), id: key, at, statement: text}),
  z.strictObject({type: z.literal("prepayment"), id: key, at, statement: text}),
]);
const clauseLabel: Record<string, string> = {financial_covenant: "covenant", negative_pledge: "garantia negativa", assignment_prohibition: "cessão", auto_renewal: "renovação",
  payment_term: "prazo de pagamento", debt_policy: "política de endividamento", collateral_top_up: "reforço de garantia", prepayment: "pré-pagamento"};
const metrics = ["ebitda", "net_revenue", "gross_revenue", "revenue", "cash", "allowance_for_doubtful_accounts", "inventory_write_off", "appraised_value"] as const;
const metricLabel: Partial<Record<(typeof metrics)[number], [string, string]>> = {allowance_for_doubtful_accounts: ["a provisão para devedores duvidosos", "da provisão para devedores duvidosos"],
  inventory_write_off: ["a baixa de estoque obsoleto", "da baixa de estoque obsoleto"]};

/** Calculation, projection, recommendation and validation in the method's or the reader's voice. */
const forbiddenVoice = /\b(calcul(?:ei|amos|ou|ad[oa]s?)|projet(?:ei|amos|ou)|recomend\w*|sugiro|sugerimos|aconselh\w*|validad[oa]s?|validei|validamos|valida[çc][aã]o)\b/i;
const ratioInText = /(\d+(?:[.,]\d+)?)\s*x\b/gi;

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
      /** What the page should hold, read elsewhere in the file (an index or a cross-reference), never guessed. */
      expectedContent: text.nullable(), expectedFrom: at.nullable()})).max(500),
    wholeFile: z.strictObject({reason: z.enum(["no_extractable_content", "unsupported_format", "password_protected"])}).nullable()}),
  /** A legible copy of pages another file of the same instrument could not give. */
  substitutesPages: z.strictObject({instrumentRef: key, pages: z.array(page).min(1).max(500)}).nullable(),
  units: z.array(z.strictObject({section: text, currency: z.string().regex(/^[A-Z]{3}$/), scale})).max(50),
  figures: z.array(z.strictObject({id: key, metric: z.enum(metrics), value: amount, scale, at})).max(100),
  clauses: z.array(clause).max(100),
  observations: z.array(z.strictObject({id: key, at, topic: z.enum(["internal_controls", "supplier_terms", "shareholder_resolution", "revision_note", "other"]), statement: text})).max(50),
  debtTable: z.strictObject({lines: z.array(z.strictObject({id: key, label: text, drawn: amount, limit: amount.nullable(), counted: amount})).min(1).max(100),
    reportedTotal: amount, scale, at}).nullable(),
}).superRefine((r, ctx) => {
  const fail = (message: string) => ctx.addIssue({code: "custom", message});
  const ids = [...r.figures.map((f) => f.id), ...r.clauses.map((c) => c.id), ...r.observations.map((o) => o.id)];
  if (new Set(ids).size !== ids.length) fail("document_inventory_duplicate_reading_id");
  const unreadable = new Set(r.legibility.unreadablePages.map((p) => p.page));
  if (unreadable.size !== r.legibility.unreadablePages.length) fail("document_inventory_duplicate_unreadable_page");
  if (r.legibility.pageCount !== null && [...unreadable].some((p) => p > r.legibility.pageCount!)) fail("document_inventory_unreadable_page_outside_file");
  const located = [...r.figures.map((f) => f.at), ...r.clauses.map((c) => c.at), ...r.observations.map((o) => o.at), ...r.debtTable ? [r.debtTable.at] : []];
  // Nothing is read from what could not be read. In a file with an unreadable page every reading names its page:
  // a section alone could stand for the page that was not read.
  if (located.some((a) => a.page !== null && unreadable.has(a.page))) fail("document_inventory_content_on_unreadable_page");
  if (unreadable.size && located.some((a) => a.page === null)) fail("document_inventory_unpaged_reading_in_partly_unreadable_file");
  if (r.substitutesPages && located.some((a) => a.page === null)) fail("document_inventory_unpaged_reading_in_substitute");
  if (r.legibility.unreadablePages.some((p) => p.expectedFrom?.page !== undefined && p.expectedFrom.page !== null && unreadable.has(p.expectedFrom.page))) fail("document_inventory_content_on_unreadable_page");
  // Free text is what the document says. A ratio stated as a measure, a recommendation or a validation is not a reading;
  // a ratio appears only in the clause that sets it as a limit, equal to the limit read.
  const texts = [r.description, r.entity.label, r.period.label, r.version.label, r.instrument?.label, r.asset?.label, ...r.legibility.unreadablePages.map((p) => p.expectedContent),
    ...r.clauses.flatMap((c) => c.type === "assignment_prohibition" ? [c.statement, c.counterparty] : [c.statement]), ...r.observations.map((o) => o.statement),
    ...r.debtTable?.lines.map((l) => l.label) ?? []].filter((x): x is string => typeof x === "string");
  if (texts.some((t) => forbiddenVoice.test(t))) fail("document_inventory_free_text_outside_reading");
  for (const c of r.clauses) {
    const ratios = [...c.statement.matchAll(ratioInText)].map((m) => m[1]!.replace(",", "."));
    const allowed = c.type === "financial_covenant" || c.type === "debt_policy" ? c.maxRatio : null;
    if (ratios.some((x) => allowed === null || !new Exact(x).eq(allowed))) fail("document_inventory_free_text_outside_reading");
  }
  if (texts.filter((t) => !r.clauses.some((c) => c.statement === t)).some((t) => new RegExp(ratioInText.source, "i").test(t))) fail("document_inventory_free_text_outside_reading");
  if (r.legibility.wholeFile && (located.length || r.units.length || r.legibility.unreadablePages.length)) fail("document_inventory_content_on_unreadable_file");
  for (const l of r.debtTable?.lines ?? []) if (l.limit !== null && new Exact(l.drawn).gt(l.limit)) fail("document_inventory_drawn_above_limit");
  if (r.instrument?.amends === r.instrument?.ref && r.instrument !== null) fail("document_inventory_amends_itself");
  if (r.substitutesPages && (r.legibility.unreadablePages.length || r.legibility.wholeFile)) fail("document_inventory_substitute_not_legible");
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

const situationSchema = z.strictObject({read: z.enum(["complete", "partial", "unreadable"]), unreadablePages: z.array(page).max(500),
  pagesFrom: z.array(z.strictObject({page, fileId: key, sha256: hash})).max(500), duplicateOf: key.nullable(),
  supersededBy: z.strictObject({fileId: key, reason: z.enum(["audited_over_draft", "higher_assurance", "later_version", "later_position"])}).nullable(),
  sideBySideWith: z.array(key).max(20), inVault: key.nullable()});
const rowSchema = z.strictObject({fileId: key, fileName: z.string().min(1).max(260), sha256: hash, order: z.number().int().min(0),
  partition: key.nullable(), group: z.enum(groupIds), groupLabel: text, kind: z.enum(documentKinds),
  description: text, entity: text, period: text, version: text, status: z.enum(documentStatuses),
  situation: situationSchema, situationLabel: text, findingIds: z.array(z.string().min(1).max(80)).max(50),
  /** Presence is not confirmation: no document is ever declared validated. */
  validated: z.literal(false)});
const source = z.strictObject({fileId: key, page: page.nullable(), section: text.nullable()});
const findingSchema = z.strictObject({id: z.string().min(1).max(80), code: z.enum(["duplicate", "draft_superseded", "version_superseded", "position_superseded",
  "versions_side_by_side", "versions_unresolved", "series_gap", "mixed_units", "stale_forecast", "total_includes_unused_limit", "total_not_recomposed",
  "amended_original", "amendment_in_force", "amendment_not_in_force", "amendment_without_original", "clause_superseded", "reading_conflict", "page_unreadable", "file_unreadable", "clause", "observation",
  "subsidiary_in_consolidated", "appraisal_without_registry", "figure_basis_differs"]),
  anchor: key, sources: z.array(source).min(1).max(20), statement: text, topic: z.enum(topics).nullable(), effect: z.enum(effects).nullable(),
  decisionStatement: text.nullable(),
  /** What the document itself says, quoted from the reading with its source; never the method's voice. */
  quoted: text.nullable(), status: z.enum(["open", "resolved"]), resolvedBy: z.array(key).max(20)});
export const documentFolderInventoryOutputSchema = z.strictObject({
  schemaVersion: z.literal("document-folder-inventory.v1"), version: z.literal(documentFolderInventoryVersion), asOf: date, mode: z.enum(inventoryModes),
  partitionByEntity: z.boolean(),
  rows: z.array(rowSchema).min(1).max(250),
  groups: z.array(z.strictObject({partition: key.nullable(), group: z.enum(groupIds), label: text, fileIds: z.array(key).min(1)})).max(200),
  families: z.array(z.strictObject({id: z.string().min(1).max(120), basis: z.enum(["period", "position", "instrument"]),
    resolution: z.enum(["audited_over_draft", "higher_assurance", "later_version", "later_position", "side_by_side", "unresolved", "effective_text"]),
    prevails: z.array(key).max(20), superseded: z.array(key).max(20), sideBySide: z.array(key).max(20), highlighted: z.boolean()})).max(100),
  effectiveTexts: z.array(z.strictObject({instrumentRef: key, label: text, fileIds: z.array(key).min(2), clauses: z.array(z.strictObject({type: text, fileId: key, clauseId: key, statement: text})).max(100)})).max(50),
  findings: z.array(findingSchema).max(500),
  /** Findings ordered by their effect on the decisions in course; absent when the request is to organize only. */
  decisionFindings: z.array(z.strictObject({rank: z.number().int().min(1), findingId: z.string().min(1).max(80), decisionIds: z.array(key).min(1), effect: z.enum(effects), statement: text, sources: z.array(source).min(1)})).max(100).nullable(),
  /** Without a decision in course, the findings that matter by general relevance. */
  generalFindings: z.array(z.strictObject({rank: z.number().int().min(1), findingId: z.string().min(1).max(80), effect: z.enum(effects), statement: text})).max(100).nullable(),
  identityChecks: z.array(z.strictObject({id: z.string().min(1).max(80), kind: z.enum(["reported_total", "period_against_months"]), fileIds: z.array(key).min(1),
    status: z.enum(["matches", "differs", "not_run"]), reported: decimal.nullable(), recomposed: decimal.nullable(), currency: z.string().regex(/^[A-Z]{3}$/), reason: text.nullable()})).max(50),
  gaps: z.array(z.strictObject({id: z.string().min(1).max(80), need: z.enum(needs), item: text, why: text, purposes: z.array(key).min(1), findingId: z.string().min(1).max(80).nullable(),
    conditional: z.boolean(), status: z.enum(["open", "resolved"]), resolvedBy: z.array(key).max(20)})).max(100),
  questions: z.array(z.strictObject({id: z.string().min(1).max(80), text, findingId: z.string().min(1).max(80).nullable(), status: z.enum(["open", "answered"]), answeredBy: key.nullable()})).max(10)
    .refine((q) => q.filter((x) => x.status === "open").length <= 2, "At most two open questions"),
  informed: z.array(z.strictObject({id: key, questionId: z.string().min(1).max(80), statement: text, author: text, date, origin: z.literal("informed")})).max(20),
  followUps: z.array(z.discriminatedUnion("kind", [
    z.strictObject({kind: z.literal("notice_deadline"), date, fileId: key, clauseId: key, decisionIds: z.array(key), scheduled: z.literal(false)}),
    z.strictObject({kind: z.literal("effective_text"), instrumentRef: key, fileIds: z.array(key).min(2)})])).max(50),
  counts: z.strictObject({files: z.number().int(), duplicates: z.number().int(), incompleteReadings: z.number().int(), superseded: z.number().int(),
    inVault: z.number().int(), withFinding: z.number().int(), pageSubstitutes: z.number().int()}),
  /** Copies whose reading differs from the reading of the same bytes: declared, never resolved in silence. */
  readingConflicts: z.array(z.strictObject({fileId: key, of: key})).max(250),
  update: z.strictObject({priorFingerprint: hash, rowsUpdated: z.array(key), rowsAdded: z.array(key), rowsPreserved: z.number().int(),
    findingsResolved: z.array(z.string()), findingsAdded: z.array(z.string()), gapsResolved: z.array(z.string()), questionsAnswered: z.array(z.string())}).nullable(),
}).refine((o) => o.counts.files === o.rows.length, "Every file is a row").refine((o) => new Set(o.rows.map((r) => r.fileId)).size === o.rows.length, "Duplicate row");
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

type Finding = z.infer<typeof findingSchema>;
type Row = z.infer<typeof rowSchema>;

/** Organizes a folder from typed readings of each file: identity by hash among the files and against
 * the vault; version families resolved without deleting any (audited over draft, later version, later
 * position, approved budget and its revision kept side by side); amendments joined to the original as
 * one text in force; what was not read, by page; findings with their source and effect, ordered by
 * the decisions in course; gaps by purpose; at most two questions. A later call with the prior
 * inventory updates only the rows what arrived touches. It never classifies by file name, never
 * calculates ratios, projects or recommends, and never declares a document validated. */
export function organizeDocumentFolder(raw: DocumentFolderInventoryInput): DocumentFolderInventory {
  const input = documentFolderInventoryInputSchema.parse(raw);
  const registry = new Map(input.entities.map((e) => [e.id, e]));
  const substitutes = input.files.filter((f) => f.substitutesPages !== null);
  const documents = input.files.filter((f) => f.substitutesPages === null);
  const byId = new Map(input.files.map((f) => [f.fileId, f]));
  const order = new Map(input.files.map((f, n) => [f.fileId, n]));

  // Identity: the first file with a hash is the document; a later file with the same hash is its copy.
  const firstByHash = new Map<string, string>(), duplicateOf = new Map<string, string>();
  for (const f of documents) {
    const first = firstByHash.get(f.sha256);
    if (first) duplicateOf.set(f.fileId, first); else firstByHash.set(f.sha256, f.fileId);
  }
  const vaultByHash = new Map(input.vault.map((v) => [v.sha256, v.documentId]));
  const live = documents.filter((f) => !duplicateOf.has(f.fileId));
  /** A copy is read as the document it repeats: same hash, same content, same reading. */
  const readingOf = (f: DocumentReading) => byId.get(duplicateOf.get(f.fileId) ?? f.fileId)!;

  // Pages read from a legible copy of the same instrument.
  const pagesFrom = new Map<string, {page: number; fileId: string; sha256: string}[]>();
  for (const s of substitutes) {
    const target = live.find((f) => f.instrument?.ref === s.substitutesPages!.instrumentRef && f.instrument.amends === null);
    if (!target) throw new Error("document_inventory_substitute_without_target");
    const unreadable = new Set(target.legibility.unreadablePages.map((p) => p.page));
    if (s.substitutesPages!.pages.some((p) => !unreadable.has(p))) throw new Error("document_inventory_substitute_for_legible_page");
    if (s.clauses.concat().some((c) => c.at.page !== null && !s.substitutesPages!.pages.includes(c.at.page))) throw new Error("document_inventory_substitute_outside_its_pages");
    pagesFrom.set(target.fileId, [...pagesFrom.get(target.fileId) ?? [], ...s.substitutesPages!.pages.map((page) => ({page, fileId: s.fileId, sha256: s.sha256}))]);
  }
  const stillUnreadable = (f: DocumentReading) => f.legibility.unreadablePages.filter((p) => !(pagesFrom.get(f.fileId) ?? []).some((x) => x.page === p.page));

  // Version families.
  const superseded = new Map<string, {fileId: string; reason: "audited_over_draft" | "higher_assurance" | "later_version" | "later_position"}>();
  const sideBySide = new Map<string, string[]>();
  const families: DocumentFolderInventory["families"] = [];
  const findings: Finding[] = [];
  const add = (f: Omit<Finding, "status" | "resolvedBy" | "topic" | "effect" | "decisionStatement" | "quoted"> & Partial<Pick<Finding, "topic" | "effect" | "decisionStatement" | "quoted">>) =>
    findings.push({topic: null, effect: null, decisionStatement: null, quoted: null, ...f, status: "open", resolvedBy: []});
  const src = (fileId: string, a: {page: number | null; section: string | null} | null = null) => ({fileId, page: a?.page ?? null, section: a?.section ?? null});
  // The same bytes read two ways is a declared conflict: neither reading wins in silence.
  const content = (f: DocumentReading) => JSON.stringify(canonical({...f, fileId: null, fileName: null}));
  const readingConflicts = [...duplicateOf].filter(([dup, first]) => content(byId.get(dup)!) !== content(byId.get(first)!)).map(([fileId, of]) => ({fileId, of}));
  for (const c of readingConflicts) add({id: `${c.fileId}-reading-conflict`, code: "reading_conflict", anchor: c.fileId, sources: [src(c.fileId), src(c.of)],
    statement: "Mesmo hash, leituras diferentes: o conteúdo é o mesmo e a leitura precisa ser refeita; nenhuma das duas foi adotada para esta cópia."});
  const figure = (f: DocumentReading, metric: string) => f.figures.find((x) => x.metric === metric) ?? null;
  const bucket = <T>(items: T[], k: (x: T) => string | null) => {const m = new Map<string, T[]>(); for (const x of items) {const g = k(x); if (g !== null) m.set(g, [...m.get(g) ?? [], x]);} return m;};

  for (const [id, members] of bucket(live.filter((f) => policy[f.kind].family === "period"), (f) => f.period.start && f.period.end && f.entity.primaryId
    ? `${f.kind}:${f.entity.primaryId}:${f.period.start}:${f.period.end}` : null)) {
    if (members.length < 2) continue;
    const statuses = new Set(members.map((m) => m.version.status));
    if (statuses.has("approved") && statuses.has("working_revision") && members.every((m) => ["approved", "working_revision"].includes(m.version.status))) {
      // An approved plan and a revision still in work are both kept; neither is chosen.
      members.forEach((m) => sideBySide.set(m.fileId, members.filter((x) => x !== m).map((x) => x.fileId)));
      families.push({id, basis: "period", resolution: "side_by_side", prevails: [], superseded: [], sideBySide: members.map((m) => m.fileId), highlighted: false});
      const approved = members.find((m) => m.version.status === "approved")!;
      for (const rev of members.filter((m) => m.version.status === "working_revision")) {
        const a = figure(approved, "ebitda"), b = figure(rev, "ebitda");
        add({id: `${rev.fileId}-side-by-side`, code: "versions_side_by_side", anchor: rev.fileId, sources: [src(rev.fileId, b?.at), src(approved.fileId, a?.at)],
          statement: `${a && b ? `EBITDA ${rev.period.label} revisto para ${brl(b.value, b.scale)} contra ${brl(a.value, a.scale)} no aprovado. ` : ""}Preservar as duas: aprovado e revisão em trabalho.`});
      }
      continue;
    }
    const ranked = [...members].sort((a, b) => assurance(b.version.status) - assurance(a.version.status) || (b.version.ordinal ?? 0) - (a.version.ordinal ?? 0) || order.get(a.fileId)! - order.get(b.fileId)!);
    const [top, second] = ranked as [DocumentReading, DocumentReading];
    if (assurance(top.version.status) === assurance(second.version.status) && (top.version.ordinal ?? 0) === (second.version.ordinal ?? 0)) {
      // Two readings of the same period with nothing in their content to rank them: both stay, the conflict is registered.
      families.push({id, basis: "period", resolution: "unresolved", prevails: [], superseded: [], sideBySide: members.map((m) => m.fileId), highlighted: false});
      const last = [...members].sort((a, b) => order.get(b.fileId)! - order.get(a.fileId)!)[0]!;
      add({id: `${last.fileId}-unresolved`, code: "versions_unresolved", anchor: last.fileId, sources: members.map((m) => src(m.fileId)),
        statement: `Há ${members.length} versões de ${last.period.label} sem status ou numeração que as distinga; nenhuma foi escolhida.`});
      continue;
    }
    const losers = ranked.slice(1);
    for (const l of losers) {
      const reason = assurance(top.version.status) > assurance(l.version.status) ? (top.version.status === "audited" && l.version.status === "draft" ? "audited_over_draft" as const : "higher_assurance" as const) : "later_version" as const;
      superseded.set(l.fileId, {fileId: top.fileId, reason});
      if (reason === "audited_over_draft") {
        const a = figure(top, "ebitda"), d = figure(l, "ebitda");
        const only = top.figures.filter((x) => metricLabel[x.metric] && !l.figures.some((y) => y.metric === x.metric));
        const items = only.map((x) => `${metricLabel[x.metric]![0]} (${brl(x.value, x.scale)})`).join(" nem ");
        const compare = a && d ? `EBITDA de ${brl(d.value, d.scale)} contra ${brl(a.value, a.scale)} na auditada` : "Versão anterior à auditada";
        add({id: `${l.fileId}-draft`, code: "draft_superseded", anchor: l.fileId, sources: [src(l.fileId, d?.at), src(top.fileId, a?.at)],
          statement: `${compare}${items ? `: a minuta não tem ${items}` : ""}. Verificar se essa versão foi enviada a algum banco.`,
          topic: "statements_version", effect: "version_conflict",
          decisionStatement: `Há duas versões ${top.period.label.startsWith("exercício") ? `das demonstrações do ${top.period.label}` : `de ${top.period.label}`}. `
            + (a && d ? `A minuta tem EBITDA de ${brl(d.value, d.scale)}; a auditada, ${brl(a.value, a.scale)}${only.length ? `, depois ${only.map((x) => metricLabel[x.metric]![1]).join(" e ")}` : ""}. ` : "")
            + "A auditada é a que vale."});
      } else {
        const notes = top.observations.filter((o) => o.topic === "revision_note");
        add({id: `${l.fileId}-superseded`, code: "version_superseded", anchor: l.fileId, sources: [src(l.fileId), ...notes.map((o) => src(top.fileId, o.at))],
          statement: `Duas versões de ${l.period.label}; a v${top.version.ordinal ?? 2} vale e esta fica como histórico.`, quoted: notes.length ? notes.map((o) => o.statement).join("; ") : null});
      }
    }
    families.push({id, basis: "period", resolution: superseded.get(losers[0]!.fileId)!.reason, prevails: [top.fileId], superseded: losers.map((l) => l.fileId), sideBySide: [], highlighted: false});
  }

  for (const [id, members] of bucket(live.filter((f) => policy[f.kind].family === "position"), (f) => f.period.end && f.entity.primaryId ? `${f.kind}:${f.entity.primaryId}` : null)) {
    if (members.length < 2) continue;
    const ranked = [...members].sort((a, b) => (a.period.end! < b.period.end! ? 1 : a.period.end! > b.period.end! ? -1 : 0));
    if (ranked[0]!.period.end === ranked[1]!.period.end) {
      families.push({id, basis: "position", resolution: "unresolved", prevails: [], superseded: [], sideBySide: members.map((m) => m.fileId), highlighted: false});
      add({id: `${ranked[1]!.fileId}-unresolved`, code: "versions_unresolved", anchor: ranked[1]!.fileId, sources: members.map((m) => src(m.fileId)),
        statement: `Há ${members.length} posições na mesma data sem nada que as distinga; nenhuma foi escolhida.`});
      continue;
    }
    for (const l of ranked.slice(1)) {
      superseded.set(l.fileId, {fileId: ranked[0]!.fileId, reason: "later_position"});
      add({id: `${l.fileId}-superseded`, code: "position_superseded", anchor: l.fileId, sources: [src(l.fileId), src(ranked[0]!.fileId)],
        statement: `Versão de ${l.period.label} da mesma ${policy[l.kind].label.toLowerCase()}. Histórico, não base atual.`});
    }
    families.push({id, basis: "position", resolution: "later_position", prevails: [ranked[0]!.fileId], superseded: ranked.slice(1).map((l) => l.fileId), sideBySide: [], highlighted: false});
  }

  // Amendments join the original as one text in force; the original alone is never the text in force.
  const effectiveTexts: DocumentFolderInventory["effectiveTexts"] = [];
  const effectiveCovenants: {ratio: string; instrument: string}[] = [];
  const instruments = live.filter((f) => f.instrument !== null);
  // Only a signed, registered or final amendment changes the text in force; a draft stays as history.
  const inForce = (f: DocumentReading) => (["signed", "registered", "final", "approved"] as string[]).includes(f.version.status);
  /** Clauses no longer in force, by file and clause id, with the file that replaced them or "draft". */
  const notInForce = new Map<string, string>();
  for (const a of instruments.filter((f) => f.instrument!.amends !== null && !inForce(f))) {
    for (const c of a.clauses) notInForce.set(`${a.fileId}:${c.id}`, "draft");
    add({id: `${a.fileId}-draft-amendment`, code: "amendment_not_in_force", anchor: a.fileId, sources: [src(a.fileId)],
      statement: `Aditamento em ${a.version.label}: sem assinatura, não altera o texto vigente e fica como histórico.`});
  }
  for (const original of instruments.filter((f) => f.instrument!.amends === null)) {
    const ref = original.instrument!.ref;
    const amendments = instruments.filter((f) => f.instrument!.amends === ref && inForce(f)).sort((a, b) => (a.period.start ?? "") < (b.period.start ?? "") ? -1 : 1);
    const clauses = new Map(original.clauses.map((c) => [c.type, {c, fileId: original.fileId}]));
    for (const a of amendments) for (const c of a.clauses) {
      const before = clauses.get(c.type);
      if (before) notInForce.set(`${before.fileId}:${before.c.id}`, a.fileId);
      clauses.set(c.type, {c, fileId: a.fileId});
    }
    const covenant = clauses.get("financial_covenant");
    if (covenant && covenant.c.type === "financial_covenant") effectiveCovenants.push({ratio: covenant.c.maxRatio, instrument: original.instrument!.label});
    if (!amendments.length) continue;
    const fileIds = [original.fileId, ...amendments.map((a) => a.fileId)];
    effectiveTexts.push({instrumentRef: ref, label: original.instrument!.label, fileIds, clauses: [...clauses.values()].map(({c, fileId}) => ({type: c.type, fileId, clauseId: c.id, statement: c.statement}))});
    families.push({id: `instrument:${ref}`, basis: "instrument", resolution: "effective_text", prevails: fileIds, superseded: [], sideBySide: [], highlighted: false});
    const changes = amendments.flatMap((a) => a.clauses.map((c) => ({a, c, before: original.clauses.find((o) => o.type === c.type) ?? null})));
    const describe = (c: DocumentReading["clauses"][number] | null, type: string, before: boolean) => {
      if (type === "financial_covenant") return c && c.type === "financial_covenant" ? (before ? `o covenant é de ${times(c.maxRatio)}` : `o covenant passa a ${times(c.maxRatio)}`) : null;
      if (type === "negative_pledge") return c && c.type === "negative_pledge" && c.exceptionAmount !== null ? `a exceção na garantia negativa é de ${brl(c.exceptionAmount, c.scale!)}` : "não há exceção de valor na garantia negativa";
      return null;
    };
    const was = changes.map((x) => describe(x.before, x.c.type, true)).filter((x): x is string => x !== null);
    const now = changes.map(({c, before}) => {
      if (c.type === "financial_covenant") {
        const prior = before?.type === "financial_covenant" ? before.maxRatio : null;
        const verb = prior === null ? "Fixou" : new Exact(c.maxRatio).gt(prior) ? "Elevou" : new Exact(c.maxRatio).lt(prior) ? "Reduziu" : "Manteve";
        return `${verb} o covenant para ${times(c.maxRatio)}`;
      }
      if (c.type === "negative_pledge" && c.exceptionAmount !== null) {
        const prior = before?.type === "negative_pledge" ? before.exceptionAmount : null;
        return prior === null ? `criou a exceção de ${brl(c.exceptionAmount, c.scale!)} em valor agregado` : `alterou a exceção para ${brl(c.exceptionAmount, c.scale!)}`;
      }
      return `alterou a cláusula de ${clauseLabel[c.type]}`;
    });
    const sentence = (parts: string[]) => parts.length ? parts.join(" e ") : "";
    add({id: `${original.fileId}-amended`, code: "amended_original", anchor: original.fileId, sources: [src(original.fileId), ...amendments.map((a) => src(a.fileId))],
      statement: `${was.length ? `Na versão original, ${sentence(was)}. ` : ""}Ler sempre com ${amendments.length > 1 ? "os aditamentos" : "o aditamento"}.`});
    for (const a of amendments) {
      const own = changes.filter((x) => x.a === a), ownNow = own.map((x) => now[changes.indexOf(x)]!);
      const binding = own.some((x) => x.c.type === "financial_covenant" || x.c.type === "negative_pledge");
      add({id: `${a.fileId}-amendment`, code: "amendment_in_force", anchor: a.fileId, sources: [src(a.fileId, own[0]?.c.at ?? null), src(original.fileId)],
        statement: `${ownNow.length ? `${sentence(ownNow)}. ` : ""}É o texto vigente junto com ${original.description.split(" ")[0]!.toLowerCase() === "escritura" ? "a escritura" : "o original"}.`,
        topic: binding ? "debt_covenant" : null, effect: binding ? "binding_limit" : null,
        decisionStatement: binding ? `O covenant ${original.instrument!.label.startsWith("debênture") ? `da ${original.instrument!.label}` : `de ${original.instrument!.label}`} é o do aditamento de ${a.period.label}. `
          + `A versão original diz que ${sentence(was)}; o aditamento ${sentence(ownNow).replace(/^./, (x) => x.toLowerCase())}. As duas precisam ser lidas juntas.` : null});
    }
  }
  for (const a of instruments.filter((f) => f.instrument!.amends !== null && inForce(f) && !instruments.some((o) => o.instrument!.ref === f.instrument!.amends && o.instrument!.amends === null))) {
    // An amendment whose original is in the vault is read with it there; one whose original is nowhere is a gap.
    if (input.vault.some((v) => v.instrumentRef === a.instrument!.amends)) continue;
    add({id: `${a.fileId}-no-original`, code: "amendment_without_original", anchor: a.fileId, sources: [src(a.fileId)],
      statement: "Aditamento sem o instrumento original na pasta ou no sistema; o texto vigente não pode ser montado sem ele."});
  }

  const prevailing = (f: DocumentReading) => !superseded.has(f.fileId);
  // A version with no winner is never read as "the" document: checks and cross-readings skip it.
  const unresolved = new Set(families.filter((x) => x.resolution === "unresolved").flatMap((x) => x.sideBySide));
  const settled = (f: DocumentReading) => prevailing(f) && !unresolved.has(f.fileId);
  // Monthly series: a month missing between the first and the last present.
  const gapsOut: {need: Need; item: string; why: string; findingId: string | null; anchor: string | null; conditional: boolean}[] = [];
  for (const [, members] of bucket(live.filter((f) => policy[f.kind].monthly && prevailing(f) && isMonth(f)), (f) => `${f.kind}:${f.entity.primaryId}`)) {
    const present = new Set(members.map((m) => m.period.start!.slice(0, 7))), sorted = [...present].sort();
    const missing = monthsBetween(`${sorted[0]}-01`, `${sorted[sorted.length - 1]}-01`).filter((m) => !present.has(m));
    if (!missing.length) continue;
    const latest = [...members].sort((a, b) => a.period.start! < b.period.start! ? 1 : -1)[0]!;
    const names = missing.map((m) => monthName(`${m}-01`));
    const id = `${latest.fileId}-series-gap`;
    add({id, code: "series_gap", anchor: latest.fileId, sources: members.map((m) => src(m.fileId)),
      statement: `Falta o ${policy[latest.kind].label.toLowerCase()} de ${names.join(", ")}: a série não fecha mês a mês sem ${missing.length > 1 ? "eles" : "ele"}.`});
    for (const n of names) gapsOut.push({need: "monthly_series", item: `${policy[latest.kind].label} de ${n}`, why: "fechar a série mês a mês e conferir o gerencial do mesmo período", findingId: id, anchor: latest.fileId, conditional: false});
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
      const lines = atLimit.map((l) => `a linha ${l.label} entra pelo limite (${brl(l.limit!, t.scale)})`).join(" e ");
      const used = atLimit.every((l) => new Exact(l.drawn).eq(0)) ? "o saldo utilizado é zero" : "o saldo utilizado é menor";
      add({id: `${f.fileId}-debt-total`, code: "total_includes_unused_limit", anchor: f.fileId, sources: [src(f.fileId, t.at)],
        statement: `Soma ${brl(t.reportedTotal, t.scale)} porque ${lines}; ${used}. Dívida em ${f.period.label}: ${drawnShown}.`,
        topic: "debt_position", effect: "figure_correction",
        decisionStatement: `A dívida em ${f.period.label} é de ${drawnShown}, não ${brl(t.reportedTotal, t.scale)}. A tabela soma o limite da linha ${atLimit.map((l) => l.label).join(" e da linha ")}, ${atLimit.every((l) => new Exact(l.drawn).eq(0)) ? "que está sem uso" : "acima do saldo usado"}.`});
    } else {
      add({id: `${f.fileId}-debt-total`, code: "total_not_recomposed", anchor: f.fileId, sources: [src(f.fileId, t.at)],
        statement: `O total informado de ${brl(t.reportedTotal, t.scale)} não fecha com as linhas, que somam ${drawnShown} de saldo utilizado.`, topic: "debt_position", effect: "figure_correction",
        decisionStatement: `A tabela de dívida de ${f.period.label} não fecha: o total informado é ${brl(t.reportedTotal, t.scale)} e as linhas somam ${drawnShown}.`});
    }
  }
  for (const report of live.filter((f) => f.kind === "management_report" && settled(f) && f.period.start && f.period.end && figure(f, "ebitda"))) {
    const window = monthsBetween(report.period.start!, report.period.end!);
    const inWindow = (f: DocumentReading) => policy[f.kind].monthly && prevailing(f) && isMonth(f) && f.entity.primaryId === report.entity.primaryId && window.includes(f.period.start!.slice(0, 7));
    // A month with versions and no winner blocks the sum: neither version is counted, and never both.
    const undecided = [...new Set(live.filter((f) => inWindow(f) && unresolved.has(f.fileId)).map((f) => f.period.start!.slice(0, 7)))].sort();
    const series = live.filter((f) => inWindow(f) && !unresolved.has(f.fileId))
      .sort((a, b) => a.period.start! < b.period.start! ? -1 : 1);
    const missing = window.filter((m) => !series.some((f) => f.period.start!.startsWith(m)) && !undecided.includes(m));
    const withoutFigure = series.filter((f) => !figure(f, "ebitda"));
    const r = figure(report, "ebitda")!, reported = inReais(r.value, r.scale);
    if (undecided.length || missing.length || withoutFigure.length) {
      identityChecks.push({id: `${report.fileId}-months`, kind: "period_against_months", fileIds: [report.fileId, ...series.map((f) => f.fileId)], status: "not_run",
        reported: reported.toFixed(), recomposed: null, currency: input.currency,
        reason: undecided.length ? `unresolved_versions:${undecided.join(",")}` : missing.length ? `missing_months:${missing.filter((m) => !undecided.includes(m)).join(",")}` : "month_without_figure"});
      continue;
    }
    const sum = series.reduce((s, f) => {const x = figure(f, "ebitda")!; return s.plus(inReais(x.value, x.scale));}, new Exact(0));
    identityChecks.push({id: `${report.fileId}-months`, kind: "period_against_months", fileIds: [report.fileId, ...series.map((f) => f.fileId)],
      status: sum.eq(reported) ? "matches" : "differs", reported: reported.toFixed(), recomposed: sum.toFixed(), currency: input.currency, reason: null});
  }

  for (const f of live) {
    const scales = [...new Set(f.units.map((u) => u.scale))];
    if (scales.length > 1) add({id: `${f.fileId}-units`, code: "mixed_units", anchor: f.fileId, sources: f.units.map((u) => src(f.fileId, {page: null, section: u.section})),
      statement: `Unidades misturadas: ${f.units.map((u) => `a aba ${u.section} está em ${scaleLabel[u.scale]}`).join(" e ")}.`});
    if (policy[f.kind].forecast && prevailing(f) && f.period.end !== null && f.period.end < input.asOf) {
      add({id: `${f.fileId}-stale`, code: "stale_forecast", anchor: f.fileId, sources: [src(f.fileId)],
        statement: `${f.version.lastUpdated ? `Última atualização em ${monthName(f.version.lastUpdated)}; ` : ""}cobre só até ${longDate(f.period.end)}, antes da data desta leitura.`});
    }
    for (const p of stillUnreadable(f)) {
      const id = `${f.fileId}-unreadable-p${p.page}`;
      add({id, code: "page_unreadable", anchor: f.fileId, sources: [src(f.fileId, {page: p.page, section: null})],
        statement: `A página ${p.page} não pôde ser lida${p.expectedContent ? `; segundo ${p.expectedFrom?.page ? `o índice da página ${p.expectedFrom.page}` : "o próprio documento"}, ela traz ${p.expectedContent}` : ""}. Pedir cópia legível.`});
      gapsOut.push({need: "reading_substitute", item: `Página ${p.page} legível ${f.instrument ? `da ${f.instrument.label}` : `de ${f.description.toLowerCase()}`}`,
        why: p.expectedContent ? `traz ${p.expectedContent}, que não foi lida` : "conteúdo não lido", findingId: id, anchor: f.fileId, conditional: false});
    }
    if (f.legibility.wholeFile) add({id: `${f.fileId}-unreadable`, code: "file_unreadable", anchor: f.fileId, sources: [src(f.fileId)],
      statement: "Não foi possível extrair conteúdo útil; pedir o arquivo original se for relevante."});
    for (const o of f.observations.filter((x) => x.topic !== "revision_note")) add({id: `${f.fileId}-${o.id}`, code: "observation", anchor: f.fileId, sources: [src(f.fileId, o.at)],
      statement: "Registrado no documento.", quoted: o.statement});
    // Clauses that restrict decisions; covenant and pledge belong to the text in force of their instrument.
    const own = [...f.clauses.map((c) => ({c, from: f.fileId})), ...substitutes.filter((s) => (pagesFrom.get(f.fileId) ?? []).some((p) => p.fileId === s.fileId)).flatMap((s) => s.clauses.map((c) => ({c, from: s.fileId})))];
    for (const {c, from} of own) {
      const replacedBy = notInForce.get(`${from}:${c.id}`);
      // A clause replaced by an amendment in force stays as history: no effect, no deadline.
      if (replacedBy && replacedBy !== "draft") {
        add({id: `${f.fileId}-${c.id}-superseded`, code: "clause_superseded", anchor: f.fileId, sources: [src(from, c.at), src(replacedBy)],
          statement: `Cláusula substituída pelo aditamento de ${byId.get(replacedBy)!.period.label}; fica como histórico.`, quoted: c.statement});
        continue;
      }
      if (replacedBy || c.type === "financial_covenant" || c.type === "negative_pledge") continue;
      const base = {id: `${f.fileId}-${from === f.fileId ? "" : `${from}-`}${c.id}`, code: "clause" as const, anchor: f.fileId, sources: [src(from, c.at)], quoted: c.statement};
      if (c.type === "assignment_prohibition") add({...base, statement: "Limita qualquer financiamento com cessão dessa carteira.", topic: "receivables_assignment", effect: "collateral_restriction",
        decisionStatement: `Os recebíveis do contrato com ${c.counterparty} não podem ser cedidos sem anuência da contraparte. O contrato veda a cessão${c.receivablesShare ? `; ${c.counterparty} responde por ${percent(c.receivablesShare)} da carteira` : ""}. Isso reduz a carteira disponível para qualquer financiamento com cessão.`});
      else if (c.type === "auto_renewal") add({...base, statement: `Aviso até ${longDate(c.noticeDeadline)} para renegociar preço ou não renovar.`, topic: "supplier_contract", effect: "deadline",
        decisionStatement: `${f.instrument ? `O ${f.instrument.label}` : f.description} renova sozinho em ${monthName(c.termEnd)}. Para renegociar preço ou não renovar, o aviso precisa sair até ${longDate(c.noticeDeadline)}.`});
      else if (c.type === "debt_policy") {
        const lowest = [...effectiveCovenants].sort((a, b) => new Exact(a.ratio).cmp(b.ratio))[0];
        const tighter = lowest && new Exact(c.maxRatio).lt(lowest.ratio);
        add({...base, statement: `Política de no máximo ${times(c.maxRatio)}${lowest ? (tighter ? `, mais restritiva que o covenant vigente de ${times(lowest.ratio)}.` : `, igual ou acima do covenant vigente de ${times(lowest.ratio)}.`) : "."}`,
          topic: "debt_policy", effect: "policy_limit",
          decisionStatement: `Há uma política de endividamento aprovada pelo conselho. A ${f.description.toLowerCase()} de ${f.period.label} fixa dívida líquida de no máximo ${times(c.maxRatio)} o EBITDA${lowest ? (tighter ? `, abaixo do covenant vigente de ${times(lowest.ratio)}. Entre os limites lidos, é o mais restritivo.` : `, não abaixo do covenant vigente de ${times(lowest.ratio)}.`) : "."}`});
      } else add({...base, statement: from === f.fileId ? "Cláusula lida no documento." : `Cláusula lida na cópia legível da página ${c.at.page}.`});
    }
  }

  // Subsidiary inside the consolidated statements of its parent.
  for (const f of live.filter((x) => x.kind === "annual_financial_statements" && settled(x) && x.entity.primaryId && registry.get(x.entity.primaryId)?.parentId)) {
    const sub = registry.get(f.entity.primaryId!)!, parent = registry.get(sub.parentId!)!;
    if (!live.some((x) => x.kind === "annual_financial_statements" && x.entity.primaryId === parent.id)) continue;
    const cash = figure(f, "cash"), id = `${f.fileId}-subsidiary`;
    add({id, code: "subsidiary_in_consolidated", anchor: f.fileId, sources: [src(f.fileId, cash?.at)],
      statement: `A consolidada inclui a ${sub.label}; a análise de crédito da devedora precisa do individual.${cash ? ` O caixa da controlada (${brl(cash.value, cash.scale)}) só sobe à controladora por dividendos ou mútuo.` : ""}`,
      topic: "group_perimeter", effect: "perimeter",
      decisionStatement: `A controlada ${sub.label} entra no consolidado.${cash ? ` O caixa dela, ${brl(cash.value, cash.scale)}, só chega à controladora por dividendo ou mútuo.` : ""}`});
    if (f.version.status !== "audited") gapsOut.push({need: "group_perimeter", item: `Demonstrações auditadas da ${sub.label}, se existirem`, why: "perímetro da devedora e caixa disponível na controladora", findingId: id, anchor: f.fileId, conditional: true});
  }
  for (const f of live.filter((x) => x.kind === "appraisal_report" && x.asset)) {
    if (live.some((x) => x.kind === "property_registry" && x.asset?.id === f.asset!.id)) continue;
    const v = figure(f, "appraised_value"), id = `${f.fileId}-registry`;
    add({id, code: "appraisal_without_registry", anchor: f.fileId, sources: [src(f.fileId, v?.at)],
      statement: `${v ? `Valor de ${brl(v.value, v.scale)}. ` : ""}Sem matrícula atualizada não dá para saber se o ${f.asset!.label} está livre de ônus.`});
    gapsOut.push({need: "real_collateral", item: `Matrícula atualizada do ${f.asset!.label}`, why: "saber se o imóvel está livre para uma garantia", findingId: id, anchor: f.fileId, conditional: false});
  }
  // A figure cited outside the statements, read against the prevailing statements of the same entity and period.
  for (const f of live.filter((x) => policy[x.kind].group !== "statements")) {
    for (const x of f.figures.filter((y) => y.metric === "revenue")) {
      const statements = live.find((s) => s.kind === "annual_financial_statements" && settled(s) && s.version.status === "audited" && s.entity.primaryId === f.entity.primaryId && s.period.start === f.period.start && s.period.end === f.period.end);
      if (!statements) continue;
      const gross = figure(statements, "gross_revenue"), net = figure(statements, "net_revenue");
      const cited = inReais(x.value, x.scale);
      if (net && cited.eq(inReais(net.value, net.scale))) continue;
      add({id: `${f.fileId}-${x.id}`, code: "figure_basis_differs", anchor: f.fileId, sources: [src(f.fileId, x.at), src(statements.fileId, (gross ?? net)?.at ?? null)],
        statement: gross && cited.eq(inReais(gross.value, gross.scale))
          ? `Cita receita de ${brl(x.value, x.scale)}, que é a receita bruta${net ? `; a líquida das demonstrações é ${brl(net.value, net.scale)}` : ""}.`
          : `Cita receita de ${brl(x.value, x.scale)}, que não coincide com a bruta nem com a líquida das demonstrações.`});
    }
  }
  for (const [dup, first] of duplicateOf) add({id: `${dup}-duplicate`, code: "duplicate", anchor: dup, sources: [src(dup), src(first)], statement: "Mesmo conteúdo, mesmo hash."});
  // Projection: a forecast that does not reach the reading date, or none at all.
  const forecasts = live.filter((f) => policy[f.kind].forecast && prevailing(f));
  const stale = findings.find((x) => x.code === "stale_forecast");
  if (!forecasts.length || stale) gapsOut.push({need: "liquidity_projection", item: "Projeção ou fluxo de caixa de 13 semanas atualizado", why: `liquidez a partir de ${monthName(input.asOf)}${stale ? "; o fluxo da pasta não chega a essa data" : ""}`,
    findingId: stale?.id ?? null, anchor: stale?.anchor ?? null, conditional: false});

  // Partition by entity first when the folder spans more than one group or an entity outside the registry.
  const partitionOf = (f: DocumentReading) => f.entity.primaryId === null ? "nao-identificada" : registry.get(f.entity.primaryId)?.groupId ?? f.entity.primaryId;
  const unregistered = [...new Set(live.flatMap((f) => f.entity.primaryId !== null && !registry.has(f.entity.primaryId) ? [f.entity.primaryId] : []))];
  const partitionByEntity = new Set(live.filter((f) => f.entity.primaryId !== null).map(partitionOf)).size > 1 || unregistered.length > 0;

  // Rows, in arrival order.
  const anchored = (fileId: string) => findings.filter((x) => x.anchor === fileId);
  const rows: Row[] = documents.map((own) => {
    const f = readingOf(own), dup = duplicateOf.get(own.fileId) ?? null, sup = superseded.get(own.fileId) ?? null, unread = stillUnreadable(own).map((p) => p.page);
    const read = own.legibility.wholeFile ? "unreadable" as const : unread.length ? "partial" as const : "complete" as const;
    const inVault = vaultByHash.get(own.sha256) ?? null;
    const label = dup ? "duplicado" : read === "unreadable" ? "ilegível" : [
      read === "partial" ? `lida, exceto ${unread.length === 1 ? `a página ${unread[0]}, ilegível` : `as páginas ${unread.join(", ")}, ilegíveis`}` : "lida",
      ...sup ? [sup.reason === "audited_over_draft" ? "superada pela auditada" : sup.reason === "later_version" ? `superada pela v${byId.get(sup.fileId)!.version.ordinal}` : sup.reason === "higher_assurance" ? "superada pela versão de maior asseguração" : "superada"] : [],
      ...inVault ? ["já estava no cofre"] : []].join("; ");
    const entityOf = f.entity.primaryId ? registry.get(f.entity.primaryId) : undefined;
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
  for (const r of rows) r.findingIds = anchored(r.fileId).map((x) => x.id);

  // Decisions in course: which findings move them, in order of effect.
  const decisions = input.mode === "organize_for_debt" ? [{id: "discussao-divida", label: "Discussão da dívida", kind: "debt_discussion" as const}, ...input.decisions] : input.decisions;
  const effectful = findings.filter((x) => x.effect !== null && x.status === "open");
  const decisionFindings = input.mode === "organize_only" || !decisions.length ? null : effectful
    .map((x) => ({x, decisionIds: decisions.filter((d) => purposes[d.kind].topics.includes(x.topic!)).map((d) => d.id)}))
    .filter((e) => e.decisionIds.length)
    .sort((a, b) => effects.indexOf(a.x.effect!) - effects.indexOf(b.x.effect!) || order.get(a.x.anchor)! - order.get(b.x.anchor)!)
    .map((e, n) => ({rank: n + 1, findingId: e.x.id, decisionIds: e.decisionIds, effect: e.x.effect!, statement: e.x.decisionStatement!, sources: e.x.sources}));
  const generalFindings = input.mode === "organize_only" || decisions.length ? null : [...effectful]
    .sort((a, b) => generalOrder.indexOf(a.effect!) - generalOrder.indexOf(b.effect!) || order.get(a.anchor)! - order.get(b.anchor)!)
    .map((x, n) => ({rank: n + 1, findingId: x.id, effect: x.effect!, statement: x.decisionStatement!}));

  // Gaps by purpose: what each decision needs, or the likely uses when none is in course.
  const uses = input.mode === "organize_only" ? [] : decisions.length ? decisions.map((d) => ({id: d.id, needs: purposes[d.kind].needs}))
    : (["debt_analysis", "projection", "bank_material"] as const).map((u) => ({id: u.replace("_", "-"), needs: purposes[u].needs}));
  const gaps: DocumentFolderInventory["gaps"] = gapsOut
    .map((g) => ({g, purposes: [...inventoryNeeds.includes(g.need) ? ["inventario"] : [], ...uses.filter((u) => u.needs.includes(g.need)).map((u) => u.id)]}))
    .filter((e) => e.purposes.length)
    .sort((a, b) => needs.indexOf(a.g.need) - needs.indexOf(b.g.need))
    .map(({g, purposes: p}) => ({id: `${g.need.replace(/_/g, "-")}-${g.anchor ?? "pasta"}${g.need === "monthly_series" ? `-${g.item.slice(-4)}-${months.findIndex((m) => g.item.includes(m)) + 1}` : ""}`,
      need: g.need, item: g.item, why: g.why, purposes: p, findingId: g.findingId, conditional: g.conditional, status: "open" as const, resolvedBy: [] as string[]}));
  if (input.prior) for (const p of input.prior.inventory.gaps) {
    if (gaps.some((g) => g.id === p.id)) continue;
    const by = findings.find((x) => x.id === p.findingId && x.status === "resolved")?.resolvedBy ?? [];
    if (!by.length) throw new Error("document_inventory_gap_dropped");
    gaps.push({...p, status: "resolved", resolvedBy: by});
  }

  // Questions only the person knows: whether a superseded draft went to a third party, and the perimeter.
  const answered = new Map(input.informed.map((i) => [i.questionId, i.id]));
  const candidates = [
    ...unregistered.length ? [{id: "perimetro", text: `${live.filter((f) => f.entity.primaryId !== null && unregistered.includes(f.entity.primaryId)).map((f) => f.entity.label).filter((v, n, a) => a.indexOf(v) === n).join(", ")} não ${unregistered.length > 1 ? "estão" : "está"} no cadastro da companhia. Entra${unregistered.length > 1 ? "m" : ""} no perímetro deste trabalho?`, findingId: null}] : [],
    ...findings.filter((x) => x.code === "draft_superseded" && policy[byId.get(x.anchor)!.kind].external).map((x) => {const f = byId.get(x.anchor)!;
      return {id: `circulacao-${f.fileId}`, text: `A minuta ${f.period.label.startsWith("exercício") ? `das demonstrações do ${f.period.label}` : `de ${f.description.toLowerCase()}`} foi enviada a algum banco? Se foi, vale mandar a versão auditada com uma nota sobre a diferença.`, findingId: x.id};}),
  ];
  for (const i of input.informed) if (!candidates.some((c) => c.id === i.questionId)) throw new Error("document_inventory_informed_without_question");
  const questions = candidates.slice(0, 2).map((c) => ({...c, status: answered.has(c.id) ? "answered" as const : "open" as const, answeredBy: answered.get(c.id) ?? null}));

  const followUps: DocumentFolderInventory["followUps"] = [
    ...live.flatMap((f) => f.clauses.flatMap((c) => c.type === "auto_renewal" && !notInForce.has(`${f.fileId}:${c.id}`) && c.noticeDeadline >= input.asOf
      ? [{kind: "notice_deadline" as const, date: c.noticeDeadline, fileId: f.fileId, clauseId: c.id, decisionIds: decisions.filter((d) => purposes[d.kind].topics.includes("supplier_contract")).map((d) => d.id), scheduled: false as const}] : [])),
    ...effectiveTexts.map((t) => ({kind: "effective_text" as const, instrumentRef: t.instrumentRef, fileIds: t.fileIds}))];

  if (input.mode === "organize_for_debt") for (const fam of families) if (fam.basis === "instrument" && fam.prevails.some((id) => policy[byId.get(id)!.kind].group === "debt")) fam.highlighted = true;
  const groupOrder: Group[] = input.mode === "organize_for_debt" ? ["debt", ...groupIds.filter((g) => g !== "debt")] : [...groupIds];
  const partitions = partitionByEntity ? [...new Set(rows.map((r) => r.partition!))].sort((a, b) => (a === "nao-identificada" ? 1 : 0) - (b === "nao-identificada" ? 1 : 0)
    || rows.findIndex((r) => r.partition === a) - rows.findIndex((r) => r.partition === b)) : [null];
  const groups = partitions.flatMap((p) => groupOrder.flatMap((g) => {const ids = rows.filter((r) => r.partition === p && r.group === g).map((r) => r.fileId); return ids.length ? [{partition: p, group: g, label: groupLabel[g], fileIds: ids}] : [];}));

  let update: DocumentFolderInventory["update"] = null;
  if (input.prior) {
    const affected = new Set(pagesFrom.keys());
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
    rows, groups, families, effectiveTexts, findings, readingConflicts, decisionFindings, generalFindings, identityChecks, gaps, questions,
    informed: input.informed.map((i) => ({...i, origin: "informed" as const})), followUps,
    counts: {files: rows.length, duplicates: rows.filter((r) => r.situation.duplicateOf).length, incompleteReadings: rows.filter((r) => r.situation.read !== "complete").length,
      superseded: rows.filter((r) => r.situation.supersededBy).length, inVault: rows.filter((r) => r.situation.inVault).length,
      withFinding: rows.filter((r) => r.findingIds.length).length, pageSubstitutes: substitutes.length},
    update};
  return documentFolderInventoryOutputSchema.parse(out);
}
