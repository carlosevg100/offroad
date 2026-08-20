import type {ArchetypeId} from "@offroad/credit-playbook";
import {archetype} from "@offroad/credit-playbook";
import type {ReconciledFact, TracedCalculation} from "@offroad/reconciliation";

/**
 * The credit model, as a structure that knows which of its cells are formulas.
 *
 * A model whose cells are all values is a printed table: the recipient reads it, disagrees
 * with the revenue growth, and has to rebuild the whole thing to see what changes. A model
 * whose cells are formulas is an argument somebody can interrogate — change the margin, watch
 * the DSCR move, find the year the covenant breaks. That difference is the entire reason a
 * credit desk sends a workbook instead of a PDF, and it is why every derived cell here carries
 * a formula string rather than a computed number.
 *
 * Three disciplines carry over from the rest of the system:
 *
 * **Inputs are marked as inputs.** Banking convention is blue for what you may change, black
 * for what is computed. It is honoured here and extended: every assumption also carries where
 * it came from — a document, or the desk's own default. An assumption presented as if the
 * company had stated it is a fabricated fact (AGENTS.md §2.2), so the ones we supplied are
 * both labelled in the sheet and collected in `deskAssumptions` for the cover note.
 *
 * **Historicals are never re-derived.** They come from reconciled facts, and each keeps its
 * field path, evidence rank, and source document in the Sources sheet.
 *
 * **This is a debt model, not an equity model.** It runs revenue to EBITDA to cash available
 * for debt service to coverage — the line a lender underwrites. It does not project a balance
 * sheet, and the workbook says so rather than implying a completeness it does not have.
 */

export type CellFormat = "money" | "percent" | "multiple" | "integer" | "text" | "years";

export type CellRole =
  /** Editable driver. Blue, per banking convention. */
  | "input"
  /** Computed in the workbook, live. */
  | "formula"
  /** Reconciled from a document. Not editable, not re-derived. */
  | "historical"
  | "label"
  | "header"
  | "total"
  | "note";

export type Cell = {
  role: CellRole;
  value?: string | number;
  /** A1 formula without the leading `=`; when present it wins over `value`. */
  formula?: string;
  format?: CellFormat;
};

export type ModelRow = {key: string; cells: Cell[]};

export type ModelSheet = {
  key: string;
  name: {pt: string; en: string};
  /** Column widths in characters. */
  widths: number[];
  rows: ModelRow[];
};

export type FinancialModel = {
  sheets: ModelSheet[];
  /** The time axis: the base year, then the projected ones. */
  periods: string[];
  /** Drivers the desk supplied because nothing in the data room did. */
  deskAssumptions: string[];
};

export type ModelInput = {
  archetypeId: ArchetypeId;
  facts: readonly ReconciledFact[];
  calculations: readonly TracedCalculation[];
  requestedAmount?: string;
  requestedTermMonths?: number;
  requestedGraceMonths?: number;
  /** Filenames by document id, for the Sources sheet. */
  filenames?: Map<string, string>;
  lang: "pt" | "en";
  /** Projected years; five is the horizon a mid-market facility is underwritten over. */
  horizonYears?: number;
};

const L = (pt: string, en: string) => ({pt, en});

const label = (text: string): Cell => ({role: "label", value: text, format: "text"});
const header = (text: string): Cell => ({role: "header", value: text, format: "text"});
const note = (text: string): Cell => ({role: "note", value: text, format: "text"});
const input = (value: number, format: CellFormat): Cell => ({role: "input", value, format});
const historical = (value: number, format: CellFormat): Cell => ({role: "historical", value, format});
const formula = (expression: string, format: CellFormat, role: CellRole = "formula"): Cell => ({role, formula: expression, format});
const blank = (): Cell => ({role: "label", value: "", format: "text"});

/** A1 column letter. Models stay well inside A..Z, but the loop is cheap and correct past it. */
export function columnLetter(index: number): string {
  let n = index;
  let out = "";
  while (n >= 0) {
    out = String.fromCharCode((n % 26) + 65) + out;
    n = Math.floor(n / 26) - 1;
  }
  return out;
}

/**
 * Builds one sheet in two phases: declare the rows, then fill them.
 *
 * The separation is what makes cross-references safe. A debt schedule's closing balance refers
 * to next year's opening balance, the projection refers to the debt sheet, and the covenants
 * refer to both — none of which can be written if a row's position is only known once its
 * cells exist. Declaring the layout first fixes every position before a single formula is
 * composed, so a reference to a row further down is as ordinary as one further up.
 */
class SheetBuilder {
  private readonly order: string[] = [];
  private readonly filled = new Map<string, Cell[]>();

  constructor(
    readonly sheetName: string,
    private readonly positions: Map<string, number>,
    private readonly sheetKey: string,
  ) {}

  declare(keys: readonly string[]): void {
    for (const key of keys) {
      this.order.push(key);
      this.positions.set(`${this.sheetKey}.${key}`, this.order.length);
    }
  }

  fill(key: string, cells: Cell[]): void {
    if (!this.positions.has(`${this.sheetKey}.${key}`)) throw new Error(`undeclared row: ${this.sheetKey}.${key}`);
    this.filled.set(key, cells);
  }

  rows(): ModelRow[] {
    return this.order.map((key) => ({key, cells: this.filled.get(key) ?? [blank()]}));
  }
}

/** `Premissas!$B$7`; the row is always absolute because a model is dragged across, not down. */
function reference(positions: Map<string, number>, sheetName: string, sheetKey: string, rowKey: string, column: number, absoluteColumn = false): string {
  const row = positions.get(`${sheetKey}.${rowKey}`);
  if (row === undefined) throw new Error(`unknown model row: ${sheetKey}.${rowKey}`);
  const quoted = /[^A-Za-z0-9_]/.test(sheetName) ? `'${sheetName}'` : sheetName;
  return `${quoted}!${absoluteColumn ? "$" : ""}${columnLetter(column)}$${row}`;
}

const factOf = (facts: readonly ReconciledFact[], path: string): ReconciledFact | undefined =>
  facts.find((fact) => fact.key.fieldPath === path || fact.key.fieldPath.endsWith(`.${path}`));

const numberOf = (facts: readonly ReconciledFact[], paths: string[]): {value: number; fact: ReconciledFact} | null => {
  for (const path of paths) {
    const fact = factOf(facts, path);
    if (fact && fact.valueType === "number") {
      const value = Number(fact.value);
      if (Number.isFinite(value)) return {value, fact};
    }
  }
  return null;
};

const calcOf = (calculations: readonly TracedCalculation[], id: string): number | null => {
  const found = calculations.find((calculation) => calculation.id === id);
  const value = found ? Number(found.value) : Number.NaN;
  return Number.isFinite(value) ? value : null;
};

export function buildFinancialModel(inputData: ModelInput): FinancialModel {
  const {facts, calculations, archetypeId, lang} = inputData;
  const horizon = inputData.horizonYears ?? 5;
  const definition = archetype(archetypeId);
  const positions = new Map<string, number>();
  const desk: string[] = [];

  // Column 0 is the label, column 1 the base year, projections run from column 2.
  const firstProjection = 2;
  const across = (make: (column: number) => Cell): Cell[] =>
    Array.from({length: horizon}, (_, index) => make(firstProjection + index));

  // ---- what the data room actually gave us --------------------------------------------------
  const revenue = numberOf(facts, ["revenue", "net_revenue", "receita_liquida"]);
  const ebitda = numberOf(facts, ["ebitda", "ebitda_ltm"]);
  const grossDebt = numberOf(facts, ["debt.total_gross", "gross_debt"]);
  const cash = numberOf(facts, ["cash", "cash_and_equivalents"]);
  const adjustedEbitda = calcOf(calculations, "adjusted_ebitda") ?? ebitda?.value ?? null;
  const netDebt = calcOf(calculations, "net_debt") ?? (grossDebt && cash ? grossDebt.value - cash.value : null);

  const baseYear = revenue?.fact.key.periodEnd?.slice(0, 4) ?? ebitda?.fact.key.periodEnd?.slice(0, 4);
  const startYear = baseYear ? Number(baseYear) : new Date().getUTCFullYear() - 1;
  const periods = [String(startYear), ...Array.from({length: horizon}, (_, index) => String(startYear + index + 1))];

  const baseRevenue = revenue?.value ?? 0;
  const baseEbitda = adjustedEbitda ?? 0;
  const marginKnown = baseRevenue > 0 && baseEbitda > 0;
  const impliedMargin = marginKnown ? baseEbitda / baseRevenue : 0.1;

  // ---- 1. Assumptions -------------------------------------------------------------------------
  const assumptionsName = lang === "pt" ? "Premissas" : "Assumptions";
  const assumptions = new SheetBuilder(assumptionsName, positions, "assumptions");
  const assumptionKeys = [
    "title", "columns",
    "base_revenue", "base_ebitda",
    "gap0",
    "revenue_growth", "ebitda_margin", "da_pct", "maintenance_capex_pct", "wc_pct", "tax_rate",
    "gap1",
    "facility", "tenor", "grace", "interest_rate",
    "gap2",
    "existing_debt", "existing_amortisation_years", "cash",
    "gap3",
    "leverage_ceiling", "minimum_dscr",
  ] as const;
  assumptions.declare(assumptionKeys);
  const A = (rowKey: string) => reference(positions, assumptionsName, "assumptions", rowKey, 1, true);

  const fromDocument = L("do data room", "from the data room");
  const fromDesk = L("premissa Offroad — editável", "Offroad assumption — editable");
  const driver = (text: {pt: string; en: string}, cell: Cell, origin: {pt: string; en: string}): Cell[] => [
    label(text[lang]),
    cell,
    note(origin[lang]),
  ];

  assumptions.fill("title", [header(lang === "pt" ? "Premissas do modelo" : "Model assumptions")]);
  assumptions.fill("columns", [
    header(lang === "pt" ? "Driver" : "Driver"),
    header(lang === "pt" ? "Valor" : "Value"),
    header(lang === "pt" ? "Origem" : "Source"),
  ]);
  assumptions.fill(
    "base_revenue",
    driver(
      L(`Receita líquida — ${periods[0]}`, `Net revenue — ${periods[0]}`),
      revenue ? historical(revenue.value, "money") : input(0, "money"),
      revenue ? fromDocument : fromDesk,
    ),
  );
  assumptions.fill(
    "base_ebitda",
    driver(
      L(`EBITDA ajustado — ${periods[0]}`, `Adjusted EBITDA — ${periods[0]}`),
      adjustedEbitda !== null ? historical(adjustedEbitda, "money") : input(0, "money"),
      adjustedEbitda !== null ? fromDocument : fromDesk,
    ),
  );
  assumptions.fill("revenue_growth", driver(L("Crescimento de receita (% a.a.)", "Revenue growth (% p.a.)"), input(0.06, "percent"), fromDesk));
  assumptions.fill(
    "ebitda_margin",
    driver(
      L("Margem EBITDA (%)", "EBITDA margin (%)"),
      input(Number(impliedMargin.toFixed(4)), "percent"),
      marginKnown ? L("margem realizada no ano-base", "margin realised in the base year") : fromDesk,
    ),
  );
  assumptions.fill("da_pct", driver(L("D&A (% da receita)", "D&A (% of revenue)"), input(0.03, "percent"), fromDesk));
  assumptions.fill("maintenance_capex_pct", driver(L("Capex de manutenção (% da receita)", "Maintenance capex (% of revenue)"), input(0.02, "percent"), fromDesk));
  assumptions.fill("wc_pct", driver(L("Variação de capital de giro (% da variação de receita)", "Working capital movement (% of revenue change)"), input(0.1, "percent"), fromDesk));
  assumptions.fill("tax_rate", driver(L("Alíquota efetiva de IR/CS (%)", "Effective tax rate (%)"), input(0.34, "percent"), L("alíquota estatutária do lucro real", "Brazilian statutory rate")));

  const facility = Number(inputData.requestedAmount ?? "0");
  const facilityKnown = Number.isFinite(facility) && facility > 0;
  assumptions.fill("facility", driver(L("Dívida pleiteada", "Facility requested"), input(facilityKnown ? facility : 0, "money"), facilityKnown ? fromDocument : fromDesk));

  const tenorMonths = inputData.requestedTermMonths ?? definition.structure.tenorMonths.typical[1];
  const graceMonths = inputData.requestedGraceMonths ?? definition.structure.gracePeriodMonths.typical[1];
  assumptions.fill("tenor", driver(L("Prazo (meses)", "Tenor (months)"), input(tenorMonths, "integer"), inputData.requestedTermMonths ? fromDocument : L("prazo típico do arquétipo", "archetype's typical tenor")));
  assumptions.fill("grace", driver(L("Carência de principal (meses)", "Principal grace (months)"), input(graceMonths, "integer"), inputData.requestedGraceMonths ? fromDocument : L("carência típica do arquétipo", "archetype's typical grace")));

  // Offroad does not price transactions (deal-structure/termsheet.ts emits no pricing). This
  // rate exists so coverage can be computed at all, and is labelled so nobody reads it as one.
  assumptions.fill(
    "interest_rate",
    driver(
      L("Custo da dívida para sensibilidade (% a.a.)", "Cost of debt for sensitivity (% p.a.)"),
      input(0.14, "percent"),
      L("placeholder de sensibilidade — não é precificação", "sensitivity placeholder — not a price"),
    ),
  );
  assumptions.fill("existing_debt", driver(L("Dívida bruta existente", "Existing gross debt"), grossDebt ? historical(grossDebt.value, "money") : input(0, "money"), grossDebt ? fromDocument : fromDesk));
  assumptions.fill("existing_amortisation_years", driver(L("Prazo remanescente da dívida existente (anos)", "Remaining tenor of existing debt (years)"), input(3, "years"), fromDesk));
  assumptions.fill("cash", driver(L("Caixa e equivalentes", "Cash and equivalents"), cash ? historical(cash.value, "money") : input(0, "money"), cash ? fromDocument : fromDesk));
  assumptions.fill(
    "leverage_ceiling",
    driver(
      L("Teto de alavancagem (Dívida líquida / EBITDA)", "Leverage ceiling (Net debt / EBITDA)"),
      input(Number(definition.structure.leverageCeiling), "multiple"),
      L("playbook Offroad para este tipo de operação", "Offroad playbook for this operation type"),
    ),
  );
  assumptions.fill(
    "minimum_dscr",
    driver(
      L("DSCR mínimo", "Minimum DSCR"),
      input(Number(definition.structure.minimumDscr), "multiple"),
      L("playbook Offroad para este tipo de operação", "Offroad playbook for this operation type"),
    ),
  );

  if (!marginKnown) {
    desk.push(lang === "pt"
      ? "Margem EBITDA de 10% — o data room não trouxe receita e EBITDA no mesmo período para calcular a margem realizada."
      : "10% EBITDA margin — the data room did not provide revenue and EBITDA for the same period.");
  }
  desk.push(lang === "pt"
    ? "Crescimento de receita de 6% a.a., D&A 3% da receita, capex de manutenção 2%, variação de capital de giro 10% da variação de receita, IR/CS a 34%."
    : "6% p.a. revenue growth, D&A at 3% of revenue, maintenance capex 2%, working capital at 10% of the revenue movement, tax at 34%.");
  desk.push(lang === "pt"
    ? "Dívida existente amortizando linearmente em 3 anos."
    : "Existing debt amortising straight-line over 3 years.");
  desk.push(lang === "pt"
    ? "Custo da dívida de 14% a.a., usado apenas para calcular cobertura. A Offroad não precifica a operação — ajuste esta célula ao custo que o mercado indicar."
    : "14% p.a. cost of debt, used only to compute coverage. Offroad does not price the transaction — set this cell to the market's indication.");

  // ---- 2. Debt schedule ------------------------------------------------------------------------
  const debtName = lang === "pt" ? "Dívida" : "Debt";
  const debt = new SheetBuilder(debtName, positions, "debt");
  debt.declare([
    "title", "periods",
    "existing_open", "existing_amort", "existing_interest", "existing_close",
    "gap1",
    "facility_open", "facility_amort", "facility_interest", "facility_close",
    "gap2",
    "total_interest", "total_amort", "debt_service", "gross_debt_close", "net_debt_close",
  ]);
  const D = (rowKey: string, column: number) => reference(positions, debtName, "debt", rowKey, column);

  debt.fill("title", [header(lang === "pt" ? "Serviço da dívida" : "Debt service")]);
  debt.fill("periods", [header(lang === "pt" ? "Linha" : "Line"), ...periods.map(header)]);

  debt.fill("existing_open", [label(lang === "pt" ? "Dívida existente — saldo inicial" : "Existing debt — opening"), blank(),
    ...across((column) => (column === firstProjection ? formula(A("existing_debt"), "money") : formula(D("existing_close", column - 1), "money")))]);
  debt.fill("existing_amort", [label(lang === "pt" ? "Dívida existente — amortização" : "Existing debt — amortisation"), blank(),
    ...across((column) => formula(`-MIN(${D("existing_open", column)},${A("existing_debt")}/MAX(1,${A("existing_amortisation_years")}))`, "money"))]);
  debt.fill("existing_interest", [label(lang === "pt" ? "Dívida existente — juros" : "Existing debt — interest"), blank(),
    ...across((column) => formula(`-${D("existing_open", column)}*${A("interest_rate")}`, "money"))]);
  debt.fill("existing_close", [label(lang === "pt" ? "Dívida existente — saldo final" : "Existing debt — closing"), blank(),
    ...across((column) => formula(`${D("existing_open", column)}+${D("existing_amort", column)}`, "money"))]);

  debt.fill("facility_open", [label(lang === "pt" ? "Dívida pleiteada — saldo inicial" : "Facility — opening"), blank(),
    ...across((column) => (column === firstProjection ? formula(A("facility"), "money") : formula(D("facility_close", column - 1), "money")))]);
  debt.fill("facility_amort", [label(lang === "pt" ? "Dívida pleiteada — amortização" : "Facility — amortisation"), blank(),
    // Principal starts after grace, then straight-line (SAC) over the remaining years.
    ...across((column) => formula(
      `-IF(${column - firstProjection + 1}<=${A("grace")}/12,0,MIN(${D("facility_open", column)},${A("facility")}/MAX(1,ROUNDUP((${A("tenor")}-${A("grace")})/12,0))))`,
      "money",
    ))]);
  debt.fill("facility_interest", [label(lang === "pt" ? "Dívida pleiteada — juros" : "Facility — interest"), blank(),
    ...across((column) => formula(`-${D("facility_open", column)}*${A("interest_rate")}`, "money"))]);
  debt.fill("facility_close", [label(lang === "pt" ? "Dívida pleiteada — saldo final" : "Facility — closing"), blank(),
    ...across((column) => formula(`${D("facility_open", column)}+${D("facility_amort", column)}`, "money"))]);

  debt.fill("total_interest", [label(lang === "pt" ? "Juros totais" : "Total interest"), blank(),
    ...across((column) => formula(`${D("existing_interest", column)}+${D("facility_interest", column)}`, "money", "total"))]);
  debt.fill("total_amort", [label(lang === "pt" ? "Amortização total" : "Total amortisation"), blank(),
    ...across((column) => formula(`${D("existing_amort", column)}+${D("facility_amort", column)}`, "money", "total"))]);
  debt.fill("debt_service", [label(lang === "pt" ? "Serviço da dívida (saída de caixa)" : "Debt service (cash out)"), blank(),
    ...across((column) => formula(`${D("total_interest", column)}+${D("total_amort", column)}`, "money", "total"))]);
  debt.fill("gross_debt_close", [label(lang === "pt" ? "Dívida bruta — saldo final" : "Gross debt — closing"), blank(),
    ...across((column) => formula(`${D("existing_close", column)}+${D("facility_close", column)}`, "money", "total"))]);
  debt.fill("net_debt_close", [label(lang === "pt" ? "Dívida líquida — saldo final" : "Net debt — closing"), blank(),
    ...across((column) => formula(`${D("gross_debt_close", column)}-${A("cash")}`, "money", "total"))]);

  // ---- 3. Projection ---------------------------------------------------------------------------
  const projectionName = lang === "pt" ? "Projeção" : "Projection";
  const projection = new SheetBuilder(projectionName, positions, "projection");
  projection.declare([
    "title", "periods",
    "revenue", "ebitda", "da", "ebit", "interest", "ebt", "tax", "net_income",
    "gap1",
    "wc", "operating_cash_flow", "maintenance_capex", "cfads", "debt_service", "free_cash_flow",
  ]);
  const P = (rowKey: string, column: number) => reference(positions, projectionName, "projection", rowKey, column);

  projection.fill("title", [header(lang === "pt" ? "Projeção operacional e capacidade de pagamento" : "Operating projection and debt capacity")]);
  projection.fill("periods", [header(lang === "pt" ? "Linha" : "Line"), ...periods.map(header)]);

  projection.fill("revenue", [
    label(lang === "pt" ? "Receita líquida" : "Net revenue"),
    formula(A("base_revenue"), "money"),
    ...across((column) => formula(`${P("revenue", column - 1)}*(1+${A("revenue_growth")})`, "money")),
  ]);
  projection.fill("ebitda", [
    label(lang === "pt" ? "EBITDA ajustado" : "Adjusted EBITDA"),
    formula(A("base_ebitda"), "money"),
    ...across((column) => formula(`${P("revenue", column)}*${A("ebitda_margin")}`, "money")),
  ]);
  projection.fill("da", [label(lang === "pt" ? "Depreciação e amortização" : "Depreciation and amortisation"), blank(),
    ...across((column) => formula(`-${P("revenue", column)}*${A("da_pct")}`, "money"))]);
  projection.fill("ebit", [label("EBIT"), blank(),
    ...across((column) => formula(`${P("ebitda", column)}+${P("da", column)}`, "money", "total"))]);
  projection.fill("interest", [label(lang === "pt" ? "Juros" : "Interest"), blank(),
    ...across((column) => formula(D("total_interest", column), "money"))]);
  projection.fill("ebt", [label(lang === "pt" ? "Lucro antes do IR" : "Profit before tax"), blank(),
    ...across((column) => formula(`${P("ebit", column)}+${P("interest", column)}`, "money", "total"))]);
  projection.fill("tax", [label(lang === "pt" ? "IR/CS" : "Income tax"), blank(),
    ...across((column) => formula(`-MAX(0,${P("ebt", column)})*${A("tax_rate")}`, "money"))]);
  projection.fill("net_income", [label(lang === "pt" ? "Lucro líquido" : "Net income"), blank(),
    ...across((column) => formula(`${P("ebt", column)}+${P("tax", column)}`, "money", "total"))]);

  projection.fill("wc", [label(lang === "pt" ? "Variação de capital de giro" : "Working capital movement"), blank(),
    ...across((column) => formula(`-(${P("revenue", column)}-${P("revenue", column - 1)})*${A("wc_pct")}`, "money"))]);
  projection.fill("operating_cash_flow", [label(lang === "pt" ? "Fluxo de caixa operacional" : "Operating cash flow"), blank(),
    ...across((column) => formula(`${P("ebitda", column)}+${P("tax", column)}+${P("wc", column)}`, "money", "total"))]);
  projection.fill("maintenance_capex", [label(lang === "pt" ? "Capex de manutenção" : "Maintenance capex"), blank(),
    ...across((column) => formula(`-${P("revenue", column)}*${A("maintenance_capex_pct")}`, "money"))]);
  // CFADS excludes expansion capex on purpose: the facility is what funds the expansion, so
  // charging it against coverage would double-count the very thing being financed.
  projection.fill("cfads", [label(lang === "pt" ? "Caixa disponível para o serviço da dívida (CFADS)" : "Cash available for debt service (CFADS)"), blank(),
    ...across((column) => formula(`${P("operating_cash_flow", column)}+${P("maintenance_capex", column)}`, "money", "total"))]);
  projection.fill("debt_service", [label(lang === "pt" ? "Serviço da dívida" : "Debt service"), blank(),
    ...across((column) => formula(D("debt_service", column), "money"))]);
  projection.fill("free_cash_flow", [label(lang === "pt" ? "Fluxo de caixa livre após serviço da dívida" : "Free cash flow after debt service"), blank(),
    ...across((column) => formula(`${P("cfads", column)}+${P("debt_service", column)}`, "money", "total"))]);

  // ---- 4. Covenants ------------------------------------------------------------------------------
  const covenantsName = "Covenants";
  const covenants = new SheetBuilder(covenantsName, positions, "covenants");
  covenants.declare(["title", "periods", "leverage_limit", "dscr_limit", "gap1", "leverage", "leverage_status", "dscr", "dscr_status"]);
  const C = (rowKey: string, column: number) => reference(positions, covenantsName, "covenants", rowKey, column);

  const within = lang === "pt" ? "dentro" : "within";
  covenants.fill("title", [header(lang === "pt" ? "Covenants e folga" : "Covenants and headroom")]);
  covenants.fill("periods", [header(lang === "pt" ? "Métrica" : "Metric"), ...periods.map(header)]);
  // Both limits live on the assumptions sheet; here they are shown, not set.
  covenants.fill("leverage_limit", [label(lang === "pt" ? "Teto de alavancagem (Dívida líquida / EBITDA)" : "Leverage ceiling (Net debt / EBITDA)"), formula(A("leverage_ceiling"), "multiple")]);
  covenants.fill("dscr_limit", [label(lang === "pt" ? "DSCR mínimo" : "Minimum DSCR"), formula(A("minimum_dscr"), "multiple")]);

  covenants.fill("leverage", [
    label(lang === "pt" ? "Alavancagem projetada" : "Projected leverage"),
    netDebt !== null && adjustedEbitda ? historical(Number((netDebt / adjustedEbitda).toFixed(2)), "multiple") : blank(),
    ...across((column) => formula(`IF(${P("ebitda", column)}=0,"",${D("net_debt_close", column)}/${P("ebitda", column)})`, "multiple")),
  ]);
  covenants.fill("leverage_status", [label(lang === "pt" ? "Alavancagem — situação" : "Leverage — status"), blank(),
    ...across((column) => formula(
      `IF(${C("leverage", column)}="","",IF(${C("leverage", column)}<=${A("leverage_ceiling")},"${within}","${lang === "pt" ? "acima do teto" : "above ceiling"}"))`,
      "text",
    ))]);
  covenants.fill("dscr", [label("DSCR"), blank(),
    ...across((column) => formula(`IF(${P("debt_service", column)}=0,"",${P("cfads", column)}/-${P("debt_service", column)})`, "multiple"))]);
  covenants.fill("dscr_status", [label(lang === "pt" ? "DSCR — situação" : "DSCR — status"), blank(),
    ...across((column) => formula(
      `IF(${C("dscr", column)}="","",IF(${C("dscr", column)}>=${A("minimum_dscr")},"${within}","${lang === "pt" ? "abaixo do mínimo" : "below minimum"}"))`,
      "text",
    ))]);

  // ---- 5. Sources ---------------------------------------------------------------------------------
  const sourceRows: ModelRow[] = [
    {key: "title", cells: [header(lang === "pt" ? "De onde vem cada número histórico" : "Where each historical number comes from")]},
    {
      key: "columns",
      cells: [
        header(lang === "pt" ? "Campo" : "Field"),
        header(lang === "pt" ? "Período" : "Period"),
        header(lang === "pt" ? "Valor" : "Value"),
        header(lang === "pt" ? "Documento" : "Document"),
        header(lang === "pt" ? "Rank de evidência" : "Evidence rank"),
        header(lang === "pt" ? "Âncora verificada" : "Anchor verified"),
      ],
    },
    ...facts.map((fact, index) => ({
      key: `fact_${index}`,
      cells: [
        label(fact.key.fieldPath),
        label(fact.key.periodEnd ?? ""),
        fact.valueType === "number" && Number.isFinite(Number(fact.value)) ? historical(Number(fact.value), "money") : label(fact.value),
        label(inputData.filenames?.get(fact.accepted.sourceDocument) ?? fact.accepted.sourceDocument),
        {role: "label" as const, value: fact.accepted.evidenceRank, format: "integer" as const},
        label(fact.accepted.anchorVerified ? (lang === "pt" ? "sim" : "yes") : (lang === "pt" ? "não" : "no")),
      ],
    })),
  ];

  const timeWidths = [46, ...Array.from({length: horizon + 1}, () => 17)];

  return {
    periods,
    deskAssumptions: desk,
    sheets: [
      {key: "assumptions", name: L("Premissas", "Assumptions"), widths: [50, 18, 46], rows: assumptions.rows()},
      {key: "projection", name: L("Projeção", "Projection"), widths: timeWidths, rows: projection.rows()},
      {key: "debt", name: L("Dívida", "Debt"), widths: timeWidths, rows: debt.rows()},
      {key: "covenants", name: L("Covenants", "Covenants"), widths: timeWidths, rows: covenants.rows()},
      {key: "sources", name: L("Fontes", "Sources"), widths: [42, 14, 20, 36, 14, 16], rows: sourceRows},
    ],
  };
}
