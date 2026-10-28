import {boardFieldOf} from "./board-capital-discussion-sources";
/** The closed library of texts a board discussion can show. A contribution never writes text: it picks a
 * template by id and binds each slot to a registered reading, a deadline of a deliberation, or nothing when the
 * template has no slot. Every text here is fixed and reviewed; numbers, units, scales, currencies, periodicity and
 * dates enter only through the formatter's markers in the slots.
 *
 * Each slot is a concept, not a dimension: it names the exact origin it admits (method and registered path, with
 * the scenario, case, row or period written literally or as a variable shared with other slots), the year it
 * shows, or the deliberation action whose deadline it carries. Each template declares the conditions its fixed
 * text asserts (sign, comparison between slots, comparison with the source, the only path inside the gates, the
 * year of largest maturity), checked against the bound readings; a template is used only in the fields it is
 * written for, and a deliberation's texts belong to that deliberation.
 *
 * Slot syntax in a text: `{slot}` for a value, a label, a yes-no reading or a deadline; `{em:slot}`, `{ate:slot}`,
 * `{desde:slot}`, `{para:slot}`, `{fim:slot}`, `{de:slot}` or `{a:slot}` for a date or a year, written by the
 * formatter with that preposition. `{count:deliberations}` and `{count:dated}` are counted by the method. */
export const boardSlotTypes = ["money", "rate", "multiple", "years", "months", "bps", "count", "date", "label", "flag", "deadline", "informed", "debtor", "object"] as const;
export type BoardSlotType = (typeof boardSlotTypes)[number];
/** The closed dictionary of reasons a person may inform: each code with its reviewed phrase. A code outside it shows the
 * template's generic words and leaves a gap; the material never carries text of the fact itself. */
export const boardInformedReasons = {
  reduce_single_supplier_dependence: "reduzir a dependência de um único fornecedor do insumo principal",
  diversify_suppliers: "diversificar fornecedores",
  own_capacity: "ganhar capacidade própria de produção",
  reduce_operational_risk: "reduzir risco operacional",
  serve_customer_contract: "atender contrato de cliente",
} as const;
/** The closed dictionary of debtors a material may name, by the debtor key the receivables result registers for an item
 * (never by the item's identifier): the canonical name. A debtor whose key is not here is named by generic words, with a gap. */
export const boardDebtorNames: Record<string, string> = {"rede-a": "rede A", "rede-b": "rede B"};
/** The closed vocabularies of objects a material may name: inputs and projects. A registered field of the source names
 * an object only when the whole field, normalized only by case, spacing and accents, equals the term or one of the
 * registered labels declared for it below; a term inside a longer text (a mention, a comparison, a negation, a
 * qualifier) never matches. Without a match the slot shows its generic words and leaves a gap. */
export type BoardObjectForm = "nome" | "Nome" | "o" | "O" | "de" | "em" | "um" | "nova" | "atual_o" | "atual_de" | "titulares";
export const boardVocabularies: Record<"input" | "project" | "species", Record<string, Partial<Record<BoardObjectForm, string>>>> = {
  input: {
    trigo: {nome: "trigo", Nome: "Trigo", o: "o trigo", O: "O trigo", de: "do trigo", em: "no trigo"},
    "açúcar": {nome: "açúcar", Nome: "Açúcar", o: "o açúcar", O: "O açúcar", de: "do açúcar", em: "no açúcar"},
    farinha: {nome: "farinha", Nome: "Farinha", o: "a farinha", O: "A farinha", de: "da farinha", em: "na farinha"},
    embalagem: {nome: "embalagem", Nome: "Embalagem", o: "a embalagem", O: "A embalagem", de: "da embalagem", em: "na embalagem"},
  },
  project: {
    "linha de embalagem": {nome: "linha de embalagem", Nome: "Linha de embalagem", o: "a linha de embalagem", O: "A linha de embalagem", de: "da linha de embalagem", em: "na linha de embalagem"},
    caldeira: {nome: "caldeira", Nome: "Caldeira", o: "a caldeira", O: "A caldeira", de: "da caldeira", em: "na caldeira"},
  },
  // The species of an instrument: named only when the instrument's registered label equals the term or a declared label.
  species: {
    "debênture": {um: "uma debênture", nova: "debênture nova", atual_o: "a debênture atual", atual_de: "da debênture atual", de: "da debênture", titulares: "debenturistas"},
    "nota comercial": {um: "uma nota comercial", nova: "nota comercial nova", atual_o: "a nota comercial atual", atual_de: "da nota comercial atual", de: "da nota comercial", titulares: "titulares da nota comercial"},
    CCB: {um: "uma CCB", nova: "CCB nova", atual_o: "a CCB atual", atual_de: "da CCB atual", de: "da CCB", titulares: "credores da CCB"},
    Finame: {um: "um Finame", nova: "Finame novo", atual_o: "o Finame atual", atual_de: "do Finame atual", de: "do Finame", titulares: "credores do Finame"},
    CRI: {um: "um CRI", nova: "CRI novo", atual_o: "o CRI atual", atual_de: "do CRI atual", de: "do CRI", titulares: "titulares do CRI"},
  },
};
/** Registered labels declared as canonical forms of a term (exact whole-field equality after normalization). A case
 * or variant label that adds only the case's schedule names the same project; any other qualifier (a unit, a site) does
 * not, so two sources with different qualifiers never name the same project. */
export const boardVocabularyLabels: Record<keyof typeof boardVocabularies, Record<string, readonly string[]>> = {
  input: {trigo: ["Informado, com trigo +15% e repasse em quatro meses"], "açúcar": [], farinha: [], embalagem: []},
  project: {
    "linha de embalagem": ["Linha de embalagem, cronograma original", "Linha de embalagem no cronograma informado", "Linha de embalagem adiada doze meses"],
    caldeira: ["Caldeira, cronograma original", "Caldeira no cronograma informado", "Caldeira adiada doze meses"],
  },
  species: {
    "debênture": ["Debênture 2021", "Debênture da 2ª emissão, R$ 90 mi", "Debênture da 2ª emissão, R$ 80 mi"],
    "nota comercial": [], CCB: ["CCB Bradesco", "CCB de três anos, R$ 30 mi", "CCB de cinco anos, R$ 70 mi", "CCB Bradesco alongada até 2029"],
    Finame: ["Finame", "Finame da linha de embalagem"], CRI: [],
  },
};
/** The generic words a slot shows when no term matches, per vocabulary and form. */
export const boardObjectGenerics: Record<keyof typeof boardVocabularies, Partial<Record<BoardObjectForm, string>>> = {
  input: {nome: "insumo", Nome: "Insumo", o: "o insumo", O: "O insumo", de: "do insumo", em: "no insumo"},
  project: {nome: "projeto analisado", Nome: "Projeto analisado", o: "o projeto analisado", O: "O projeto analisado", de: "do projeto analisado", em: "no projeto analisado"},
  // Capital markets without a registered species: the kind only, and a gap of species.
  species: {um: "um instrumento de mercado de capitais", nova: "instrumento de mercado de capitais novo", atual_o: "o instrumento de mercado de capitais atual",
    atual_de: "do instrumento de mercado de capitais atual", de: "do instrumento de mercado de capitais", titulares: "titulares do instrumento de mercado de capitais"},
};
/** Case, spacing and accents only. */
export const boardNormalizeLabel = (x: string) => x.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();
/** The term whose name or declared label equals the whole registered text, or null. */
export function boardObjectTerm(vocabulary: keyof typeof boardVocabularies, text: string): string | null {
  const want = boardNormalizeLabel(text);
  const hits = Object.keys(boardVocabularies[vocabulary]).filter((term) => [term, ...boardVocabularyLabels[vocabulary][term] ?? []].some((x) => boardNormalizeLabel(x) === want));
  return hits.length === 1 ? hits[0]! : null;
}
/** What an exact-definition check ignores in an input object, and nothing else: link ids (decision, slot, actor and
 * observation ids, the scenario dimension, record ids inside field paths) and source anchors (keys ending in anchor,
 * and the origin tag of a value). */
export const boardInputIgnored = ["decisionId", "slotKey", "actorId", "observationId", "dimensions.scenario", "referenceDimensions.scenario", "ids de registro no caminho do campo", "*Anchor", "origin"] as const;
export const boardIgnoredInputKey = (key: string) => /anchor$/i.test(key) || key === "origin";
export type BoardCanonicalInput = Record<string, unknown> & {value?: unknown; dimensions?: Record<string, unknown>};
/** An input object (adopted contributions) in canonical form: keyed by field path without record ids, ignored keys out,
 * values as their raw value, keys sorted. */
export function boardCanonicalInputs(raw: unknown): Map<string, BoardCanonicalInput> | null {
  if (!Array.isArray(raw)) return null;
  const sorted = (v: unknown): unknown => Array.isArray(v) ? v.map(sorted) : v !== null && typeof v === "object"
    ? Object.fromEntries(Object.entries(v as Record<string, unknown>).filter(([k]) => !boardIgnoredInputKey(k)).sort(([x], [y]) => x.localeCompare(y)).map(([k, x]) => [k, sorted(x)])) : v;
  const out = new Map<string, BoardCanonicalInput>();
  for (const e of raw) {
    if (e === null || typeof e !== "object" || typeof (e as {fieldPath?: unknown}).fieldPath !== "string") return null;
    const {fieldPath, decisionId: _d, slotKey: _s, actorId: _a, observationId: _o, value, dimensions, referenceDimensions, ...rest} = e as Record<string, unknown>;
    const key = (fieldPath as string).split(".").filter((x) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(x)).slice(1).join(".");
    const dims = (d: unknown) => {if (d === null || typeof d !== "object") return d; const {scenario: _x, ...r} = d as Record<string, unknown>; return r;};
    if (out.has(key)) return null;
    out.set(key, sorted({...rest, value: (value as {value?: unknown} | undefined)?.value ?? value, valueType: (value as {type?: unknown} | undefined)?.type ?? null,
      dimensions: dims(dimensions), referenceDimensions: dims(referenceDimensions)}) as BoardCanonicalInput);
  }
  return out;
}
/** A deferral, defined exactly: the case is the reference moved uniformly by k periods. Every time-indexed series of
 * the whole input object follows deferred[t + k] = reference[t] for every t of the reference, with the declared
 * neutral value for t < k; dates move by k periods; everything else is equal. The series are enumerated here by
 * field; a series of the horizon's length that is not listed refuses the deferral. Neutral values: flow, zero; stock and
 * rate or convention in force, the reference's first value; multiplier, zero; calendar (period ends), the reference's
 * first end plus t periods; index (valuation times), t. Dates: the project's dates move by k periods; the valuation
 * base date is the decision date and stays. */
export const boardDeferralRules: {series: Record<string, "flow" | "stock" | "first" | "zero" | "calendar" | "index">; shiftedDates: readonly string[]; fixedDates: readonly string[]} = {
  series: {
    periodEnds: "calendar", "valuation.adoptedTimes": "index",
    "project.annualNetRevenue": "flow", "project.annualAvoidedOperatingCost": "flow", "project.annualVariableOperatingCost": "flow", "project.annualFixedOperatingCost": "flow",
    "project.annualMaintenanceCapex": "flow", "project.growthCapexPaid": "flow", "project.annualDepreciation": "flow",
    "project.cashTaxRate": "first", "project.lossTaxTreatment": "first", "project.fixedCostScaling": "first", "project.startup.retainedCapitalMultipliers": "zero",
    "company.ebitda": "flow", "company.nonCashEbitdaBridge": "flow", "company.cashLeasePayments": "flow", "company.netWorkingCapitalChange": "flow",
    "company.maintenanceCapex": "flow", "company.growthCapex": "flow", "company.taxableBaseBeforeProject": "flow", "company.netFinancingCashAvailable": "flow",
    "company.netCapitalCashAvailable": "flow", "company.netRestrictedCashMovement": "flow", "company.closingDebtStock": "stock", "company.cashTaxRate": "first", "company.lossTaxTreatment": "first",
    // The plan's project variants (fixed horizon): every component is a flow.
    "variant.growthCapex": "flow", "variant.ebitda": "flow", "variant.depreciation": "flow", "variant.maintenanceCapex": "flow", "variant.startupWorkingCapitalCashFlow": "flow",
  },
  shiftedDates: ["project.ramp.operationStartMonth", "company.finalPaymentDates"],
  fixedDates: ["valuation.baseDate"],
};
const monthIndex = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
/** An ISO date moved by a number of months, keeping the day, or the month's last day when the day was the last. */
export function boardShiftDate(iso: string, months: number) {
  const m = monthIndex(iso) + months, y = Math.floor(m / 12), mo = m % 12 + 1, last = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const wasLast = Number(iso.slice(8, 10)) === new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate();
  return `${y}-${String(mo).padStart(2, "0")}-${String(wasLast ? last : Math.min(Number(iso.slice(8, 10)), last)).padStart(2, "0")}`;
}
/** The k by which a plan variant is the reference variant uniformly deferred within the plan's fixed horizon, or null:
 * every series follows deferred[t] = reference[t - k] for t >= k and its neutral value before, the tail beyond the
 * horizon falling out; the label is the variant's name; every other field equal; a series the rules do not list refuses. */
export function boardIsUniformPlanDeferral(a: Map<string, BoardCanonicalInput>, b: Map<string, BoardCanonicalInput>): number | null {
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  const series: [unknown[], unknown[], string][] = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(key), y = b.get(key);
    if (!x || !y) return null;
    if (key === "variant.label") continue;
    const {value: xv, ...xr} = x, {value: yv, ...yr} = y;
    if (!same(xr, yr)) return null;
    const rule = boardDeferralRules.series[key];
    if (rule) {
      if (!Array.isArray(xv) || !Array.isArray(yv) || xv.length !== yv.length || rule !== "flow") return null;
      series.push([xv, yv, key]); continue;
    }
    if (Array.isArray(yv) && yv.length > 1) return null; // a series the rules do not enumerate
    if (!same(xv, yv)) return null;
  }
  if (!series.length) return null;
  const n = series[0]![1].length;
  for (let k = 1; k < n; k++)
    if (series.every(([x, y]) => x.every((v, t) => String(v) === (t >= k ? String(y[t - k]) : "0"))) && series.some(([, y]) => y.slice(0, n - k).some((v) => String(v) !== "0"))) return k;
  return null;
}
/** The k by which the case is the reference uniformly deferred, or null. */
export function boardIsUniformDeferral(a: Map<string, BoardCanonicalInput>, b: Map<string, BoardCanonicalInput>): number | null {
  const refEnds = b.get("periodEnds")?.value, caseEnds = a.get("periodEnds")?.value;
  if (!Array.isArray(refEnds) || !Array.isArray(caseEnds) || refEnds.length < 2) return null;
  const n = refEnds.length, k = caseEnds.length - n;
  if (k < 1) return null;
  const step = monthIndex(String(refEnds[1])) - monthIndex(String(refEnds[0]));
  if (step <= 0) return null;
  const same = (x: unknown, y: unknown) => JSON.stringify(x) === JSON.stringify(y);
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(key), y = b.get(key);
    if (!x || !y) return null;
    const {value: xv, dimensions: xd, ...xr} = x, {value: yv, dimensions: yd, ...yr} = y;
    if (!same(xr, yr)) return null;
    // Dimensions: equal, except the horizon end, which is each case's own last period end.
    const {periodEnd: xe, ...xdr} = (xd ?? {}) as Record<string, unknown>, {periodEnd: ye, ...ydr} = (yd ?? {}) as Record<string, unknown>;
    if (!same(xdr, ydr) || (xe !== undefined && xe !== caseEnds.at(-1)) || (ye !== undefined && ye !== refEnds.at(-1))) return null;
    const rule = boardDeferralRules.series[key];
    if (rule) {
      if (!Array.isArray(xv) || !Array.isArray(yv) || yv.length !== n || xv.length !== n + k) return null;
      for (let t = 0; t < n + k; t++) {
        const want = rule === "calendar" ? boardShiftDate(String(refEnds[0]), t * step) : rule === "index" ? String(t)
          : t >= k ? yv[t - k] : rule === "flow" || rule === "zero" ? "0" : yv[0];
        if (rule === "index" && t < n && String(yv[t]) !== String(t)) return null;
        if (rule === "calendar" && t < n && String(yv[t]) !== boardShiftDate(String(refEnds[0]), t * step)) return null;
        if (String(xv[t]) !== String(want)) return null;
      }
      continue;
    }
    if (Array.isArray(yv) && yv.length === n) return null; // a time series the rules do not enumerate
    if (boardDeferralRules.shiftedDates.includes(key)) {
      const xs = Array.isArray(xv) ? xv : [xv], ys = Array.isArray(yv) ? yv : [yv];
      if (xs.length !== ys.length || xs.some((v, i) => String(v) !== boardShiftDate(String(ys[i]), k * step))) return null;
      continue;
    }
    if (!same(xv, yv)) return null;
  }
  return k;
}
/** Who may be named as the author of an informed fact. */
export const boardInformedAuthors = ["chair", "cfo", "ceo"] as const;
export const boardTextUses = ["delib.title", "delib.subject", "delib.recommendation", "delib.action", "page.title", "page.line", "page.recommendation", "page.option",
  "summary.opening", "summary.closing", "appendix", "question", "answer", "topic", "note", "requester", "authority"] as const;
export type BoardTextUse = (typeof boardTextUses)[number];

/** A slot: its type and the one concept it admits. `from` lists the admissible [method, path] (selectors literal or
 * `$var`); `year` admits a year reading whose value matches (literal or `$var`); `action` is the deliberation action
 * a deadline slot announces. */
export type BoardSlotSpec = {type: BoardSlotType; from?: readonly (readonly [string, string])[]; year?: string; action?: string;
  /** The registered concept the field must carry (receivables: balance, capacity, program volume and sublimit differ). */
  concept?: string;
  /** For money: what the sentence reads the amount as (a position at a date, a change or amount over a period, or a value);
   * the field's registered nature must be the same. */
  nature?: "balance" | "flow" | "value";
  /** For an object: the vocabulary whose term the bound registered text must name, and the form the sentence uses. */
  vocabulary?: "input" | "project" | "species";
  form?: BoardObjectForm;
  /** For an informed fact: the person the template attributes it to; the fact must be adopted as informed by that person. */
  author?: (typeof boardInformedAuthors)[number];
  /** For a label: the generic words shown when the source name is not an entry of the closed name dictionary. */
  generic?: string};
/** An operand of a condition: a bound slot's source value, a literal (variables written as `$name` substituted), a
 * shared variable or a field of the source (`at`: [method, path], variables substituted); `year` compares the first
 * four characters. */
export type BoardOperand = {slot: string; year?: true} | {value: string} | {var: string} | {at: readonly [string, string]; year?: true}
  /** An adopted term the result records among its contributions, by the end of its field path (a contract clause). */
  | {contributed: readonly [string, string]}
  /** In a schedule (a list of the source, by key), the key of the first or last effective payment (field not zero), or
   * the schedule's last listed key. */
  | {firstPaid: readonly [string, string, string, string]} | {lastPaid: readonly [string, string, string, string]} | {lastListed: readonly [string, string, string]};
export type BoardComparison = "lt" | "le" | "gt" | "ge" | "eq" | "ne" | "prefix";
/** Every condition may name the material assertion of the fixed text it sustains; the library is swept by these. */
export type BoardCondition = BoardConditionBody & {claim?: string};
type BoardConditionBody =
  | {compare: readonly [BoardOperand, BoardComparison, BoardOperand]}
  /** Every element of a list of the source: its field compared with the operand. */
  | {every: readonly [string, string, string]; op: BoardComparison; than: BoardOperand}
  /** The elements of a list whose flag is true are exactly one, and its key equals the operand. */
  | {onlyFlagged: readonly [string, string, string, string]; equals: BoardOperand}
  /** The element of a list with the largest value has its key equal to the operand. */
  | {largest: readonly [string, string, string, string]; equals: BoardOperand}
  /** Binds a variable to a field of the source, for the conditions after it. */
  | {bind: string; to: BoardOperand}
  /** A list of the source (or a field of each element) contains the operand; `only` requires it to be the single element. */
  | {includes: readonly [string, string, string | null]; value: BoardOperand; only?: true; none?: true}
  /** A list of the source has at least this many elements. */
  | {atLeast: readonly [string, string]; count: number}
  /** A series against another, period by period over the second series' periods (matched by key): "gt" every value at least the other's and one larger,
   * "lt" every value at most and one smaller, "eq" all equal. A series that does not resolve fails the condition. */
  | {dominates: readonly [BoardSeries, BoardSeries]; op: "gt" | "lt" | "eq"}
  /** An adopted list among the contributions of the result (by the end of its field path) contains, or with none lacks, the value. */
  | {contributedHas: readonly [string, string]; value: BoardOperand; none?: true; only?: true}
  /** The same object in another source: a registered text of that source (contribution by the end of its field path,
   * variables substituted) names the same vocabulary term as the reading bound to the slot. */
  | {sameObject: readonly [string, string]; vocabulary: "input" | "project"; slot: string; where?: readonly [string, string]}
  /** A registered text of the source (contributions whose field path ends as given, * for one segment) names the term. */
  | {registeredTerm: readonly [string, string]; vocabulary: "input" | "project"; term: string}
  /** A list of the source has at most this many elements. */
  | {atMost: readonly [string, string]; count: number}
  /** A common base for two readings compared in one sentence: the two registered records are equal in every field except
   * the ones the sentence declares as the difference ("a.b", or "a[*].b" inside every element of a list). */
  | {sameBase: readonly [string, string, string]; differ: readonly string[]}
  /** Two definitions (objects of the source, flattened, source anchors ignored) differ exactly in the named fields: each
   * changes somewhere and nothing else changes. */
  | {changedOnly: readonly [string, string, string]; fields: readonly string[]}
  /** The case is the reference moved uniformly by k periods (boardDeferralRules), k at least one. */
  | {deferredBy: readonly [string, string, string]}
  /** Compliance with a limit, by the source's registered tests: the measurement (or, with null, every test measurement) is
   * registered as a test of that very limit, not breached; and no test of that limit at the same date and scenario is
   * registered as breached. */
  | {testsLimit: readonly [string, string | null, string]}
  /** Over every element of a list (not the first N), the number joining a target whose field takes one of the given values. */
  | {joinedCount: readonly [string, string, string, string, string, readonly string[]]; count: number}
  /** A flow shown with a year: the interval its row registers is exactly that calendar year. */
  | {coversYear: readonly [string, string]}
  /** The field bound to the slot is a limit the source registers with this side and inclusion of the limit value. */
  | {boundary: readonly [string, "minimum" | "maximum", boolean]}
  /** Grouped over every element of a list, the group with the largest total is unique and is the one given. */
  | {largestGroup: readonly [string, string, string, string]; equals: BoardOperand}
  /** The two shown figures cover the same period: the period the method fixes, or the same horizon the source registers. */
  | {samePeriod: readonly [string, string]}
  /** A plan variant is the reference variant moved uniformly by k periods within the plan's fixed horizon. */
  | {planDeferred: readonly [string, string, string]}
  /** A projection scenario changes exactly the named drivers against the scenario it derives from (its overrides, its
   * volume rule and its input-cost shock are its whole definition). */
  | {scenarioDefines: readonly [string, string]; drivers: readonly string[]}
  /** Two series at one key: the first compared with the second. */
  | {atKey: readonly [BoardSeries, BoardSeries]; key: BoardOperand; op: BoardComparison}
  /** The first key at which a series is not zero comes strictly after the second series' first such key. */
  | {startsLater: readonly [BoardSeries, BoardSeries]}
  /** The complete set of moves of a plan path, read from the instruments' terms: kinds of new or amended instruments
   * (aditamento, debenture_nova, fomento, bancario_sem_amortizacao_programada, bancario_programado), existing ones removed, prepaid and charged
   * (debenture_atual, or $i for the named row), and whether the project variant is the status quo's. */
  | {pathMoves: readonly [string, string]; added: readonly string[]; removed: readonly string[]; prepaid: readonly string[]; charges: readonly string[]; variant: "same" | "other"}
  /** An extension of the named instrument: an amended instrument replaces it, pays finally later and repays less principal. */
  | {extendsDebt: readonly [string, string]};
/** A per-period series of a source: a list read by path (each element's key and dotted field), or an adopted list among
 * the contributions of the result, by the end of its field path (index as key). Variables are substituted. */
export type BoardSeries = {list: readonly [string, string]; key: string; field: string} | {contributed: readonly [string, string]}
  /** The rows of a projection scenario (the base when the id is base), by period. */
  | {projectionRows: readonly [string, string]; field: string}
  /** The driver a projection scenario uses, per period: its own override, else the one of the scenario it is based on, down to the base. */
  | {projectionDriver: readonly [string, string, string]};
export type BoardTemplate = {text: string; slots: Record<string, BoardSlotSpec>; use: readonly BoardTextUse[]; when: readonly BoardCondition[];
  /** For a deliberation's texts: the title template of the deliberation they belong to. */
  of?: string;
  /** For an answer: the question template it answers. */
  answers?: string;
  /** The declared wording when an order the text asserts between two shown figures holds on the values but not on the
   * figures as shown (same rounded number): it states no order. */
  nearlyEqual?: string};

const DT = "build-company-debt-table", CV = "measure-covenant-headroom", WC = "project-weekly-cash", IP = "analyze-investment-project",
  OP = "build-operating-projection", PC = "challenge-financial-projection", RF = "monetize-receivables-for-working-capital", RC = "analyze-relative-debt-cost",
  FP = "evaluate-financing-paths";
const s = (type: BoardSlotType, method: string, path: string, nature?: "balance" | "flow" | "value"): BoardSlotSpec => ({type, from: [[method, path]], ...nature ? {nature} : {}});
const yr = (year: string): BoardSlotSpec => ({type: "date", year});
const dl = (action: string): BoardSlotSpec => ({type: "deadline", action});
const op = (x: string): BoardOperand => /^-?\d+(?:\.\d+)?$/.test(x) ? {value: x} : /^\$[a-z]+$/.test(x) ? {var: x.slice(1)} : {slot: x};
const cmp = (a: string | BoardOperand, how: BoardComparison, b: string | BoardOperand): BoardCondition => ({compare: [typeof a === "string" ? op(a) : a, how, typeof b === "string" ? op(b) : b]});
const at = (method: string, path: string, year?: true): BoardOperand => year ? {at: [method, path], year} : {at: [method, path]};
type Extra = {when?: BoardCondition[]; of?: string; answers?: string; nearlyEqual?: string};
/** Names the material assertion a condition sustains. */
const claim = (text: string, ...conditions: BoardCondition[]): BoardCondition[] => conditions.map((c) => ({...c, claim: text}));
const has = (method: string, list: string, field: string | null, value: string): BoardCondition => ({includes: [method, list, field], value: {value}});
const lacks = (method: string, list: string, field: string | null, value: string | BoardOperand): BoardCondition =>
  ({includes: [method, list, field], value: typeof value === "string" ? {value} : value, none: true});
const t = (use: BoardTextUse | BoardTextUse[], text: string, slots: Record<string, BoardSlotSpec> = {}, extra: Extra = {}): BoardTemplate =>
  ({text, slots, use: Array.isArray(use) ? use : [use], when: extra.when ?? [], ...extra.of ? {of: extra.of} : {}, ...extra.answers ? {answers: extra.answers} : {}, ...extra.nearlyEqual ? {nearlyEqual: extra.nearlyEqual} : {}});

// Shared concepts, each with the assertion it sustains.
const maturityYear: BoardCondition = {largest: [DT, "result.table.profile.scheduleByYear", "principal", "year"], equals: {slot: "ano"}, claim: "o ano mostrado é o de maior vencimento de principal"};
const horizonYear: BoardCondition = {...cmp("ano", "eq", at(FP, "readings.horizon.lastPeriodEnd", true)), claim: "o ano mostrado é o fim do horizonte do plano"};
const tightBelowMinimum: BoardCondition = {...cmp(at(WC, "readings.tightestWeek.belowMinimum"), "eq", {value: "true"}), claim: "o caixa fica abaixo do mínimo na semana mais apertada"};
const allBelowPolicy: BoardCondition = {every: [CV, "result.headroom.measurements", "ratio"], op: "lt", than: {slot: "politica"}, claim: "todas as medições ficam abaixo da política"};
const adverseYear: BoardCondition = {...cmp("ano", "eq", at(CV, "result.headroom.measurements[id=$ma].date", true)), claim: "o ano é o da medição adversa"};
/** The adverse measurement is adverse by its registered scenario, never by its identifier. */
const adverseScenario: BoardCondition = {...cmp(at(CV, "result.headroom.measurements[id=$ma].scenario"), "eq", {value: "adverse"}), claim: "a medição é do cenário adverso registrado"};
const policyIsBoard = claim("a política é do conselho e está em vigor", cmp(at(CV, "result.headroom.limits[id=politica].kind"), "eq", {value: "board_policy"}),
  cmp(at(CV, "result.headroom.limits[id=politica].status"), "eq", {value: "in_force"}));
const policyUndefined = claim("a política adotada não registra definição de EBITDA (questão aberta do resultado do covenant)",
  has(CV, "result.openQuestions", "limitId", "politica"), has(CV, "result.openQuestions", "question", "ebitda_definition_not_written"));
/** No template asserts a cause. A text describes a scenario by what it is in its source, and only when the scenario
 * differs from its reference exactly in the drivers the sentence names, active in the period the sentence shows; a
 * scenario that changes more can only be named by a generic label. A deferral needs its schedule deferred (first
 * disbursement and first operation strictly later than the reference); EBITDA does not count. The library checks that
 * every text naming a scenario carries its definition. */
export const boardScenarioDefinitions = [
  {scenario: "economia menor", method: "analyze-investment-project", phrase: /economia menor/i, drivers: "só custo operacional evitado, custo variável e custo fixo do projeto (project.annualAvoidedOperatingCost, project.annualVariableOperatingCost, project.annualFixedOperatingCost); a economia operacional líquida (custo evitado menos custo variável menos custo fixo, o EBITDA incremental que a fonte calcula) menor ou igual em todo período do horizonte e menor em algum, contra a mesma referência; redistribuição no tempo ou aumento em algum período recusa; todo o resto do objeto de entrada do caso (projeto, partida, rampa, companhia, avaliação: taxa de desconto, perspectiva, data-base, convenções, precisão) igual ao da referência",
    reference: "o caso de que o cenário herda (inheritedScenario)", vigency: "todo o horizonte do caso; o texto mostra o VPL do horizonte"},
  {scenario: "capex e depreciação maiores", method: "analyze-investment-project", phrase: /capex e depreciação maiores/i, drivers: "só capex de expansão e depreciação do projeto (project.growthCapexPaid, project.annualDepreciation); o capex de expansão e a depreciação incremental que a fonte calcula, maiores ou iguais em todo período e maiores em algum; todo o resto do objeto de entrada do caso (projeto, partida, rampa, companhia, avaliação: taxa de desconto, perspectiva, data-base, convenções, precisão) igual ao da referência",
    reference: "o caso de que o cenário herda (inheritedScenario)", vigency: "todo o horizonte do caso; o texto mostra o VPL do horizonte"},
  {scenario: "partida mais lenta", method: "analyze-investment-project", phrase: /partida mais lenta/i, drivers: "só o mês de início da operação (project.ramp.operationStartMonth), posterior; meses e frações em operação decorrem dele; todo o resto do objeto de entrada do caso (projeto, partida, rampa, companhia, avaliação: taxa de desconto, perspectiva, data-base, convenções, precisão) igual ao da referência",
    reference: "o caso de que o cenário herda (inheritedScenario)", vigency: "todo o horizonte do caso; o texto mostra o VPL do horizonte"},
  {scenario: "capex e início de operação adiados", method: "analyze-investment-project", phrase: /início de operação adiados e horizonte da análise estendido/i,
    drivers: "o caso é a base deslocada uniformemente em k períodos: toda série do objeto de entrada inteiro com deferred[t + k] = base[t] e o valor neutro declarado antes (fluxo zero, multiplicador zero, saldo e taxa ou convenção vigentes iguais ao primeiro valor, datas de período e tempos de avaliação contínuos), datas do projeto deslocadas k períodos, data-base da avaliação igual, todo o resto igual (boardDeferralRules)",
    reference: "o caso de papel base", vigency: "todo o horizonte do caso"},
  {scenario: "projeto adiado", method: "evaluate-financing-paths", phrase: /adiamento\s+\{projeto\}/i,
    drivers: "todos os componentes registrados da variante (capex de expansão, EBITDA, depreciação, manutenção e capital de giro de partida), cada um começando estritamente depois",
    reference: "a variante do caminho que mantém a dívida e segue com o projeto", vigency: "todo o horizonte do plano"},
  {scenario: "insumo mais caro com repasse", method: "build-operating-projection", phrase: /cenário\s+\{insumo\}\s+(?:\{[a-z_]+\}\s+)?mais caro/i, drivers: "só o choque de custo do insumo (inputCostShock), positivo; nenhum override, nenhuma regra de volume",
    reference: "o cenário de que deriva (basedOn)", vigency: "o choque começa até o fim do período mostrado (fromPeriodId)"},
  {scenario: "prazo maior de recebimento das redes", method: "build-operating-projection", phrase: /prazo maior de recebimento/i, drivers: "só o prazo de recebimento (override receivableDays); nenhum outro override, nenhuma regra de volume, nenhum choque",
    reference: "o cenário de que deriva (basedOn)", vigency: "o prazo é maior que o da referência no período mostrado"},
  {scenario: "dívida mantida como está", method: "evaluate-financing-paths", phrase: /mantida a dívida como está/i, drivers: "o caminho de status quo, sem pré-pagamentos",
    reference: "o próprio plano", vigency: "todo o horizonte do plano"},
] as const;
/** Scenarios no template names because the released result does not hold their definition. */
export const boardScenariosNotNamed = [
  {scenario: "sem a linha da safra (projeção semanal de caixa)", method: "project-weekly-cash",
    reason: "o resultado publicado não registra quais fluxos cada caso carrega; a linha mostra o caso alternativo de menor caixa, sem nomear o que o define"},
] as const;
const scenario = (name: (typeof boardScenarioDefinitions)[number]["scenario"], ...conditions: BoardCondition[]) => claim(`cenário: ${name}`, ...conditions);
const caseRows = (caseId: string, field: string): BoardSeries => ({list: [IP, `cases[id=${caseId}].result.project.rows`], key: "periodId", field});
const inherited = (v: string, caseId: string): BoardCondition => ({bind: v, to: at(IP, `cases[id=${caseId}].result.inheritedScenario`)});
const vsRef = (caseId: string, v: string, field: string, op: "gt" | "lt" | "eq"): BoardCondition => ({dominates: [caseRows(caseId, field), caseRows(`$${v}`, field)], op});
// The case's whole input object: its adopted contributions, compared field by field with the reference case's.
const exactly = (caseId: string, v: string, fields: string[]): BoardCondition =>
  ({changedOnly: [IP, `cases[id=${caseId}].result.contributions`, `cases[id=${v.startsWith("$") ? v : `$${v}`}].result.contributions`], fields});
const smallerEconomy = scenario("economia menor", inherited("refe", "economy-4"),
  exactly("economy-4", "refe", ["project.annualAvoidedOperatingCost", "project.annualVariableOperatingCost", "project.annualFixedOperatingCost"]),
  // The quantity the phrase names: the net operating economy (avoided cost less the project's variable and fixed costs),
  // which the source computes as the project's incremental EBITDA; with revenue, ramp and every other input equal to the
  // reference's, it is dominated period by period over the whole horizon, never the gross avoided cost alone.
  vsRef("economy-4", "refe", "incrementalEbitda", "lt"));
const largerCapex = scenario("capex e depreciação maiores", inherited("refc", "capex-120"), exactly("capex-120", "refc", ["project.growthCapexPaid", "project.annualDepreciation"]),
  vsRef("capex-120", "refc", "growthCapex", "gt"), vsRef("capex-120", "refc", "incrementalDepreciation", "gt"));
const slowerStart = scenario("partida mais lenta", inherited("refs", "slower-start"), exactly("slower-start", "refs", ["project.ramp.operationStartMonth"]),
  cmp(at(IP, "cases[id=slower-start].result.ramp[0].operands.operationStartMonth"), "gt", at(IP, "cases[id=$refs].result.ramp[0].operands.operationStartMonth")));
const deferral = scenario("capex e início de operação adiados", {bind: "refd", to: at(IP, "cases[role=base].id")},
  {deferredBy: [IP, "cases[id=defer-12].result.contributions", "cases[id=$refd].result.contributions"]});
/** The deferral case named only by the role the analysis registers for it, when it is not an exact deferral. */
const registeredDeferral = claim("a análise registra o caso com papel de adiamento", cmp(at(IP, "cases[id=defer-12].role"), "eq", {value: "deferral"}));
/** A plan path's project variant against the variant of the path that keeps the debt and goes on with the line. */
const planVariant = (path: string, kind: "project" | "none"): BoardCondition[] => [{bind: "pv", to: at(FP, `result.evaluation.paths[id=${path}].projectVariantId`)},
  {bind: "pr", to: at(FP, "result.evaluation.paths[id=manter].projectVariantId")}, cmp({contributed: [FP, "variant.$pr.kind"]}, "eq", {value: "project"}),
  cmp({contributed: [FP, "variant.$pv.kind"]}, "eq", {value: kind})];
const wheatScenario = (id: string) => scenario("insumo mais caro com repasse", {scenarioDefines: [OP, id], drivers: ["inputCostShock"]},
  cmp(at(OP, `result.projection.projection.scenarios[id=${id}].inputCostShock.rate`), "gt", {value: "0"}),
  cmp(at(OP, `result.projection.projection.scenarios[id=${id}].inputCostShock.fromPeriodId`), "le", {value: "$y-12-31"}));
const longerReceivables = (id: string) => scenario("prazo maior de recebimento das redes", {scenarioDefines: [OP, id], drivers: ["receivableDays"]},
  {bind: "rpar", to: at(OP, `result.projection.projection.scenarios[id=${id}].basedOn`)},
  {atKey: [{projectionDriver: [OP, id, "receivableDays"]}, {projectionDriver: [OP, "$rpar", "receivableDays"]}], key: {value: "$y-12-31"}, op: "gt"});
/** The complete moves of a plan path against the status quo; anything the sentence does not declare refuses it. */
const moves = (path: string, m: {added?: string[]; removed?: string[]; prepaid?: string[]; charges?: string[]; variant: "same" | "other"}): BoardCondition =>
  ({pathMoves: [FP, path], added: m.added ?? [], removed: m.removed ?? [], prepaid: m.prepaid ?? [], charges: m.charges ?? [], variant: m.variant});
// New bank credit without a scheduled amortization after the horizon (repaid within it or released seasonally): a
// kind by the terms only; the words "de curto prazo" come from the {bankcredit:path} token, proven by the term.
/** The declared limit for "curto prazo": an effective term registered by the plan (termYears of the instrument's cost,
 * from the start of its draw period to its last payment) of at most twelve months, the usual convention. */
export const boardShortTermYears = "1";
const bankUnscheduled = "bancario_sem_amortizacao_programada", bankScheduled = "bancario_programado";
const keptDebt = scenario("dívida mantida como está", moves("manter", {variant: "same"}));
/** The plan's alternative: no line, crop working capital and a bank extension that prepays the named row, with the debenture waiver and consent. */
const bankFallback = claim("o plano alternativo do resultado é exatamente: sem a linha, crédito bancário novo sem amortização programada após o horizonte e financiamento bancário novo com amortização programada que pré-paga a dívida da linha nomeada, com waiver da debênture e anuência",
  {bind: "alt", to: at(FP, "readings.alternative.pathId")},
  moves("$alt", {added: [bankUnscheduled, bankScheduled], prepaid: ["$i"], charges: ["waiver|debenture_atual"], variant: "other"}),
  cmp(at(FP, "readings.paths[id=$alt].consentRequired"), "eq", {value: "true"}), {bind: "av", to: at(FP, "result.evaluation.paths[id=$alt].projectVariantId")},
  cmp({contributed: [FP, "variant.$av.kind"]}, "eq", {value: "none"}));
const longIsDebenture = claim("o instrumento longo recomendado é de mercado de capitais (debênture), pelos termos do plano",
  {bind: "li", to: at(FP, "readings.recommendation.longInstrument.id")}, {contributedHas: [FP, "instrument.$li.terms"], value: {value: "capital_markets"}});
/** The two first steps of the receivables plan are anchor programs of the customers, adding no measured debt (by kind, never by option id). */
const programsFirst = claim("o plano começa por dois programas de antecipação dos próprios clientes, sem dívida bancária nova",
  {bind: "ofirst", to: at(RF, "result.funding.plan.steps[0].optionId")}, {bind: "osecond", to: at(RF, "result.funding.plan.steps[1].optionId")},
  ...["$ofirst", "$osecond"].flatMap((o) => [cmp(at(RF, `result.funding.options[id=${o}].kind`), "eq", {value: "anchor_program"}),
    cmp(at(RF, `readings.options[id=${o}].measuredDebtAdded`), "eq", {value: "0"})]));
const bankReserve = claim("a linha bancária fica só como reserva", cmp(at(RF, "result.funding.plan.reserve"), "eq", at(RF, "result.funding.bankLine")),
  lacks(RF, "result.funding.plan.steps", "optionId", at(RF, "result.funding.bankLine")));
/** "Sem dívida bancária nova": no step of the whole plan (not only the first two) uses a bank option. */
/** The cost coverage the source registers for both rating actions. */
const ratingCoverage = (coverage: string) => claim(coverage === "incomplete" ? "a cobertura de custos registrada das duas ações está incompleta" : "a cobertura de custos registrada das duas ações está completa no horizonte",
  ...(["low", "high"] as const).flatMap((sc) => [{bind: `a${sc}`, to: at(RC, `levers[role=rating&scenario=${sc}].actionId`)} as BoardCondition,
    cmp(at(RC, `result.actions[actionId=$a${sc}].result.operands.costCoverage`), "eq", {value: coverage})]));
const noBankStep = claim("nenhum passo do plano inteiro usa opção bancária", {joinedCount: [RF, "result.funding.plan.steps", "optionId", "result.funding.options", "kind", ["bank_discount", "bank_line"]], count: 0});
/** "Os programas", "no primeiro e no segundo": the whole plan has exactly two steps of anchor programs. */
const twoProgramsOnly = claim("o plano inteiro tem exatamente dois passos de programas dos clientes", {joinedCount: [RF, "result.funding.plan.steps", "optionId", "result.funding.options", "kind", ["anchor_program"]], count: 2});
const L = "readings.recommendation.longInstrument.";
const issue = s("money", FP, L + "issueTarget", "value"), term = s("years", FP, L + "termYears");
/** The demand floor is inclusive: the smallest amount, on the adopted quantum, that keeps the recommended path inside every
 * gate (the floor itself passes; one quantum below does not), read as the method's demand record of the long instrument. */
const inclusiveFloor = (slot: string) => claim("o piso é o menor montante, no quantum adotado, que passa em todos os critérios: o próprio piso passa",
  {boundary: [slot, "minimum", true]}, cmp(at(FP, "result.evaluation.recommendation.demand.quantum"), "gt", {value: "0"}),
  cmp(at(FP, "result.evaluation.recommendation.demand.instrumentId"), "eq", at(FP, L + "id")), cmp(slot, "eq", at(FP, "result.evaluation.recommendation.demand.issueFloorInsideGates")));
/** "De até" the issue target: the target is an inclusive maximum, the whole amount the plan evaluates. */
const upToTarget = (slot: string) => claim("o alvo é o montante inteiro avaliado, limite máximo inclusivo", {boundary: [slot, "maximum", true]});
const policy = s("multiple", CV, "result.headroom.limits[id=politica].maximumRatio"), covenant = s("multiple", CV, "result.headroom.limits[id=aditamento].maximumRatio");
const schedule = (profile: string) => `result.evaluation.paths[id=$p].amortizationTests[profileId=${profile}].years`;
const metric = (type: BoardSlotType, caseId: string, field: string, nature?: "balance" | "flow" | "value") => s(type, IP, `comparison.metrics[caseId=${caseId}].${field}`, nature);
/** The base path: a measurement of the registered base scenario. */
/** Every compliance sentence: the measurement shown is a registered test of the very limit shown, not breached, and no
 * registered test of that limit at its date and scenario is breached (null: no test of the limit is breached). */
const complies = (measurementId: string | null, limitId: string) => claim(measurementId === null ? "nenhum teste registrado do limite mostrado está violado"
  : "a medição mostrada é teste registrado do limite mostrado, sem violação registrada nesse limite, data e cenário", {testsLimit: [CV, measurementId, limitId]});
const baseScenarioOf = (id: string) => claim("a medição é do cenário base registrado", cmp(at(CV, `result.headroom.measurements[id=${id}].scenario`), "eq", {value: "base"}));
/** "Pela definição da escritura": the measurement tests the contractual limit in force, whose definition is registered. */
const contractualTest = (id: string) => claim("a medição testa o limite contratual vigente, com definição registrada",
  {bind: "lc", to: at(CV, `result.headroom.measurements[id=${id}].tests[kind=contractual].limitId`)},
  cmp(at(CV, "result.headroom.limits[id=$lc].kind"), "eq", {value: "contractual"}), cmp(at(CV, "result.headroom.limits[id=$lc].status"), "eq", {value: "in_force"}),
  cmp(at(CV, "result.definitions[limitId=$lc].definition"), "ne", {value: ""}));
const measurement = (type: BoardSlotType, id: string, field: string, nature?: "balance" | "flow" | "value") => s(type, CV, `result.headroom.measurements[id=${id}].${field}`, nature);
const tightWeek = s("date", WC, "readings.tightestWeek.weekStart");
/** A receivables field by its registered concept: balance, capacity, program volume and sublimit never stand for one another. */
const rf = (type: BoardSlotType, path: string, concept: string, nature?: "balance" | "flow" | "value"): BoardSlotSpec => ({type, from: [[RF, path]], concept, ...nature ? {nature} : {}});
const negative = (...slots: string[]) => claim("cada valor é negativo", ...slots.map((x) => cmp(x, "lt", "0")));
/** The creditor of one row of the debt table, by its registered creditor field; the fixed text never names it. */
const creditorOf = (row: string, generic = "credor sem nome confirmado"): BoardSlotSpec => ({type: "label", from: [[DT, `result.table.rows[id=${row}].creditor`]], generic});
/** The obligation the plan prepays is the row whose creditor is shown. */
const prepaidIn = (path: string): BoardCondition => ({includes: [FP, `result.evaluation.paths[id=${path}].prepayments`, "instrumentId"], value: {var: "i"}, claim: "o caminho pré-paga a dívida da linha nomeada"});
/** The path rows share one sentence; only the reviewed name of the path changes, every slot reads that path, and the name is sustained by the path's fields. */
const pathRow = (name: string, id: string) => {
  const p = `readings.paths[id=${id}].`;
  return t("page.line", `${name}: caixa mínimo de {caixa}; alavancagem de {alavancagem}; custo de {custo}; dívida líquida {em:ano} de {divida}; nos critérios: {criterios}; anuência: {anuencia}.`,
    {caixa: s("money", FP, p + "minimumCash.amount", "balance"), alavancagem: s("multiple", FP, p + "worstLeverage"), custo: s("money", FP, p + "horizonFinancingCost", "flow"),
      ano: yr("$y"), divida: s("money", FP, p + "netDebtAtHorizon", "balance"), criterios: s("flag", FP, p + "eligible"), anuencia: s("flag", FP, p + "consentRequired")}, {when: [horizonYear]});
};
/** The line of moves of one path: its label and the complete set of its moves, each verified, nothing else. */
const pathMovesLine = (text: string, id: string, m: Parameters<typeof moves>[1], extra: BoardCondition[] = [], creditor = false, form: BoardObjectForm = "nome") =>
  t("page.line", text, {projeto: obj("project", form, IP, "cases[id=base].label"), ...(creditor ? {credor: creditorOf("$i")} : {})},
    {when: [...claim("o caminho tem exatamente estes movimentos", moves(id, m)), ...extra, ...sameProject]});

// Named objects: each bound to the registered field that names it; the identity across sources is a condition.
const obj = (vocabulary: keyof typeof boardVocabularies, form: BoardObjectForm, method: string, path: string): BoardSlotSpec =>
  ({type: "object", vocabulary, form, from: [[method, path]], generic: boardObjectGenerics[vocabulary][form]!});
const project = (form: BoardObjectForm) => obj("project", form, IP, "cases[id=base].label");
const input = (form: BoardObjectForm) => obj("input", form, OP, "result.projection.projection.scenarios[id=informado-trigo-4m].label");
const sameProject = claim("cada variante com projeto do plano de capital tem rótulo canônico igual ao do caso base da análise de investimento",
  {sameObject: [FP, "~variant.*.label"], vocabulary: "project", slot: "projeto", where: ["kind", "project"]});

const anchorSlots: Record<string, BoardSlotSpec> = {rede: {type: "debtor", from: [[RF, "result.funding.portfolio.items[itemId=$d].label"]], generic: "um único cliente"},
  saldo: rf("money", "result.funding.portfolio.items[itemId=$d].amount", "saldo_da_carteira_por_devedor", "balance"), carteira: rf("money", "readings.gross", "carteira_bruta", "balance"),
  volume: rf("money", "result.funding.options[id=$o].byItem[itemId=$d].retained", "volume_do_programa_por_devedor", "balance"),
  taxa: rf("rate", "readings.options[id=$o].spreadOverDi", "spread_sobre_cdi_do_programa")};
const anchorCommon: BoardCondition[] = [...claim("o saldo do cliente cabe na carteira", cmp("saldo", "le", "carteira")),
  ...claim("o contrato registrado do cliente veda a cessão sem consentimento", cmp({contributed: [RF, "item.$d.contract"]}, "eq", {value: "prohibited_without_consent"})),
  ...claim("o programa é sem regresso e oferecido a esse cliente", cmp(at(RF, "result.funding.options[id=$o].kind"), "eq", {value: "anchor_program"}),
    cmp(at(RF, "result.funding.options[id=$o].recourse"), "eq", {value: "without_recourse"}),
    cmp(at(RF, "result.funding.options[id=$o].byItem[itemId=$d].offered"), "eq", {value: "true"})),
  ...claim("o volume do cliente no programa cabe no saldo dele", cmp("volume", "le", "saldo"))];

export const boardTemplates: Readonly<Record<string, BoardTemplate>> = {
  // Deliberations: title, subject, recommendation and dated actions, each bound to its deliberation.
  "delib.packaging_line": t("delib.title", "{projeto}", {projeto: project("Nome")}),
  "delib.packaging_line.subject": t("delib.subject", "decidir o caminho {projeto}", {projeto: project("de")}, {of: "delib.packaging_line"}),
  "delib.packaging_line.wait": t("delib.recommendation", "não emitir o pedido de compra antes das cotações", {}, {of: "delib.packaging_line",
    when: [...claim("o caso que a análise registra como adiamento tem VPL maior que seguir agora", cmp(at(IP, "comparison.metrics[caseId=defer-12].netPresentValue"), "gt", at(IP, "comparison.metrics[caseId=base].netPresentValue"))),
      ...registeredDeferral]}),
  "delib.crop": t("delib.title", "Capital de giro {de:ano}", {ano: yr("$y")}, {when: claim("o ano é o do aperto de caixa da safra", cmp("ano", "eq", at(WC, "readings.tightestWeek.weekStart", true)))}),
  "delib.crop.subject": t("delib.subject", "decidir o financiamento do capital de giro {de:ano}", {ano: yr("$y")},
    {of: "delib.crop", when: claim("o ano é o do aperto de caixa da safra", cmp("ano", "eq", at(WC, "readings.tightestWeek.weekStart", true)))}),
  "delib.crop.programs": t("delib.recommendation", "financiar o capital de giro começando pelos programas de antecipação dos próprios clientes, com a linha bancária só como reserva",
    {}, {of: "delib.crop", when: [...programsFirst, ...bankReserve, ...noBankStep]}),
  "delib.maturities": t("delib.title", "Vencimentos {de:ano}", {ano: yr("$y")}, {when: [maturityYear]}),
  "delib.maturities.subject": t("delib.subject", "decidir a rota para os vencimentos {de:ano}", {ano: yr("$y")}, {of: "delib.maturities", when: [maturityYear]}),
  "delib.maturities.sounding": t("delib.recommendation", "autorizar a sondagem de {species:um:long} de até {valor}, com prazo de {prazo}, com o plano alternativo apresentado no material",
    {valor: issue, prazo: term}, {of: "delib.maturities", when: [...longIsDebenture, ...upToTarget("valor"), ...claim("o resultado tem plano alternativo", {bind: "alt", to: at(FP, "readings.alternative.pathId")})]}),
  "delib.policy": t("delib.title", "Política de endividamento"),
  "delib.policy.definition": t("delib.subject", "definir qual EBITDA mede o limite de {limite}", {limite: policy}, {of: "delib.policy", when: [...policyIsBoard, ...policyUndefined]}),
  "delib.action.supplier_notice": t("delib.action", "enviar ao fornecedor o aviso para renegociar o contrato", {}, {of: "delib.packaging_line"}),
  "delib.action.join_programs": t("delib.action", "aderir aos programas", {}, {of: "delib.crop"}),
  "delib.action.finish_sounding": t("delib.action", "concluir a sondagem", {}, {of: "delib.maturities"}),
  "delib.action.decide_route": t("delib.action", "decidir a rota", {}, {of: "delib.maturities"}),
  // Pages: titles and lines.
  "page.decisions": t("page.title", "Pedimos {count:deliberations} decisões; {count:dated} têm prazo"),
  "situation.debt_total": t("page.title", "A dívida é de {total}, concentrada {em:ano}", {total: s("money", DT, "result.table.reconciliation.principal", "balance"), ano: yr("$y")}, {when: [maturityYear]}),
  "situation.debt_maturity": t("page.line", "{principal} de principal vencem {em:ano}; {parcela} da dívida vence {ate:horizonte}.",
    {principal: s("money", DT, "result.table.profile.scheduleByYear[year=$y].principal", "flow"), ano: yr("$y"), parcela: s("rate", DT, "result.table.profile.dueWithinTwelveMonthsShare"),
      horizonte: s("date", DT, "result.table.profile.twelveMonthHorizon")},
    {when: claim("o horizonte é limite máximo inclusivo: vence até a data, inclusive", {boundary: ["horizonte", "maximum", true]})}),
  "situation.debt_profile": t("page.line", "Prazo médio de {prazo}; maior credor: {credor}, com {participacao} da dívida.",
    {prazo: s("years", DT, "result.table.profile.weightedAverageLifeYears"), credor: {type: "label", from: [[DT, "result.table.profile.largestCreditor.creditor"]], generic: "sem nome confirmado"},
      participacao: s("rate", DT, "result.table.profile.largestCreditor.share")},
    {when: claim("o maior credor é único: nenhum outro credor tem o mesmo principal somado", {largestGroup: [DT, "result.table.rows", "creditor", "principal"], equals: at(DT, "result.table.profile.largestCreditor.creditor")})}),
  "situation.cash_shortfall": t("page.title", "O caixa fica abaixo do mínimo {em:semana} e, mantida a dívida como está, chega a {saldo} {fim:ano}",
    {semana: tightWeek, saldo: s("money", FP, "result.evaluation.paths[id=manter].closingAvailableByPeriod[periodId=$y-12-31].closingAvailable", "balance"), ano: yr("$y")},
    {when: [tightBelowMinimum, ...keptDebt]}),
  // The released weekly result does not record which flows each case carries, so the cause of this case is not asserted.
  "situation.cash_without_line": t("page.line", "No caso alternativo de menor caixa, o caixa {em:semana} é de {saldo}, contra o mínimo de {minimo}.",
    {semana: s("date", WC, "readings.sensitivities[caseId=sem-linha].weekStart"), saldo: s("money", WC, "readings.sensitivities[caseId=sem-linha].minimum", "balance"),
      minimo: s("money", WC, "result.weekly.minimumCash", "balance")}, {when: [...claim("o caixa sem a linha fica abaixo do mínimo", cmp("saldo", "lt", "minimo")),
      ...claim("o caso é alternativo e o de menor caixa entre os casos alternativos", cmp(at(WC, "result.weekly.cases[id=sem-linha].role"), "eq", {value: "alternative"}),
        {every: [WC, "readings.sensitivities", "minimum"], op: "ge", than: {slot: "saldo"}})]}),
  "situation.debt_service": t("page.line", "Serviço da dívida {em:ano}: {servico}, contra {disponivel} de caixa disponível.",
    {ano: yr("$y"), servico: s("money", FP, "result.evaluation.paths[id=manter].debtServiceByYear[year=$y].service", "flow"),
      disponivel: s("money", FP, "result.evaluation.paths[id=manter].debtServiceByYear[year=$y].availableForService", "flow")},
    {when: [...claim("o serviço supera o caixa disponível", cmp("servico", "gt", "disponivel")),
      ...claim("o caminho lido é o status quo registrado do plano", {contributedHas: [FP, "path.manter.terms"], value: {value: "status_quo"}})]}),
  // The basket is the one of the holder's contract, named by the holder row's creditor; the identifier only links its readings.
  "constraint.indenture_basket": t("page.title", "O contrato da dívida com {titular} tem só {saldo} livres na exceção para garantias de nova dívida",
    {titular: {type: "label", from: [[DT, "result.table.rows[id=$h].creditor"]], generic: "o credor sem nome confirmado"},
      saldo: s("money", DT, "result.table.negativePledgeBaskets[holderId=$h].remaining", "balance")},
    {when: claim("o saldo da exceção é menor que a exceção do contrato", cmp("saldo", "ge", "0"), cmp("saldo", "lt", at(DT, "result.table.negativePledgeBaskets[holderId=$h].basket")))}),
  "constraint.basket_usage": t("page.line", "Exceção de {cesta} para garantias, com {ocupado} ocupados pelas garantias da dívida com {credor}.",
    {cesta: s("money", DT, "result.table.negativePledgeBaskets[holderId=$h].basket", "balance"), ocupado: s("money", DT, "result.table.negativePledgeBaskets[holderId=$h].occupied", "balance"),
      credor: creditorOf("$i")},
    {when: [...claim("o ocupado cabe na exceção", cmp("ocupado", "le", "cesta")),
      {includes: [DT, "result.table.negativePledgeBaskets[holderId=$h].usedBy", null], value: {var: "i"}, only: true, claim: "só a dívida nomeada ocupa a exceção"}]}),
  "constraint.covenant_policy": t("page.line", "Covenant de {covenant} na escritura; política do conselho de {politica}.", {covenant, politica: policy},
    {when: [...claim("o covenant é contratual e está em vigor", cmp(at(CV, "result.headroom.limits[id=aditamento].kind"), "eq", {value: "contractual"}),
      cmp(at(CV, "result.headroom.limits[id=aditamento].status"), "eq", {value: "in_force"})), ...policyIsBoard]}),
  "topic.project_return": t("page.title", "{projeto} rende {retorno}, acima do custo de capital de {custo}",
    {projeto: project("O"), retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate")}, {when: claim("o retorno supera o custo de capital", cmp("retorno", "gt", "custo")), nearlyEqual: "{projeto} rende {retorno}, praticamente igual ao custo de capital de {custo}"}),
  "topic.project_value": t("page.line", "Retorno de {retorno} contra custo de capital de {custo}; VPL de {vpl}.",
    {retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate"), vpl: metric("money", "base", "netPresentValue", "value")}),
  "topic.project_payback": t("page.line", "Payback de cerca de {payback}; o fluxo acumulado do projeto chega a {pico} {em:data}.",
    {payback: metric("years", "base", "paybackYears"), pico: metric("money", "base", "peakCumulativeCashNeed.amount", "balance"), data: metric("date", "base", "peakCumulativeCashNeed.periodEndDate")}),
  "topic.project_sensitivities": t("page.line", "O VPL fica negativo em cada sensibilidade: com economia menor, {vpl_economia}; com capex e depreciação maiores, {vpl_capex}; com partida mais lenta, {vpl_partida}.",
    {vpl_economia: metric("money", "economy-4", "netPresentValue", "value"), vpl_capex: metric("money", "capex-120", "netPresentValue", "value"), vpl_partida: metric("money", "slower-start", "netPresentValue", "value")},
    {when: [...negative("vpl_economia", "vpl_capex", "vpl_partida"), ...smallerEconomy, ...largerCapex, ...slowerStart]}),
  "topic.project_wait_quotes_registered": t("page.recommendation", "Recomendamos pedir cotações antes do pedido de compra; no caso que a análise registra como adiamento, o VPL fica em {vpl} e o retorno em {retorno}.",
    {vpl: metric("money", "defer-12", "netPresentValue", "value"), retorno: metric("rate", "defer-12", "annualIrr")},
    {when: [...claim("o caso registrado como adiamento tem VPL maior que seguir agora", cmp("vpl", "gt", at(IP, "comparison.metrics[caseId=base].netPresentValue"))), ...registeredDeferral]}),
  "option.wait_quotes_registered": t("page.option", "Esperar as cotações, no caso que a análise registra como adiamento: VPL de {vpl} e retorno de {retorno}.",
    {vpl: metric("money", "defer-12", "netPresentValue", "value"), retorno: metric("rate", "defer-12", "annualIrr")}, {when: registeredDeferral}),
  "topic.project_wait_quotes": t("page.recommendation", "Recomendamos pedir cotações antes do pedido de compra; com capex e início de operação adiados e horizonte da análise estendido na mesma medida, o VPL fica em {vpl} e o retorno em {retorno}.",
    {vpl: metric("money", "defer-12", "netPresentValue", "value"), retorno: metric("rate", "defer-12", "annualIrr")},
    // The definition first (conditions 0 and 1), then the comparison with going on now (condition 2).
    {when: [...deferral, ...claim("o caso com capex e início de operação adiados tem VPL maior que seguir agora", cmp("vpl", "gt", at(IP, "comparison.metrics[caseId=base].netPresentValue")))]}),
  "option.go_now": t("page.option", "Seguir agora: VPL de {vpl} e retorno de {retorno}.", {vpl: metric("money", "base", "netPresentValue", "value"), retorno: metric("rate", "base", "annualIrr")}),
  "option.staged": t("page.option", "Seguir em etapas: VPL de {vpl}.", {vpl: metric("money", "staged", "netPresentValue", "value")}),
  "option.wait_quotes": t("page.option", "Esperar as cotações, com capex e início de operação adiados e horizonte da análise estendido na mesma medida: VPL de {vpl} e retorno de {retorno}.",
    {vpl: metric("money", "defer-12", "netPresentValue", "value"), retorno: metric("rate", "defer-12", "annualIrr")}, {when: deferral}),
  // An informed fact, attributed: the chair's strategic reason, adopted as informed by the chair; never a financial conclusion.
  "topic.project_strategic_reason": t("page.line", "Motivo apresentado pelo presidente do conselho: {motivo}.", {motivo: {type: "informed", author: "chair", generic: "a confirmar"}}),
  "topic.crop_programs": t("page.title", "Os programas dos clientes antecipam {valor} contra o pico de {pico}, sem dívida bancária nova",
    {valor: rf("money", "readings.plan[optionId=$o].cumulative", "volume_antecipavel_acumulado_no_plano", "balance"),
      pico: rf("money", "result.funding.need.peak", "pico_da_necessidade_de_caixa", "balance")},
    {when: [...programsFirst, ...noBankStep, ...twoProgramsOnly, ...claim("o valor é o acumulado do plano até o segundo programa", cmp("$o", "eq", {var: "osecond"}))]}),
  "topic.crop_program_cost": t("page.line", "Custo indicativo dos programas de antecipação: CDI mais {taxa_b} no primeiro e CDI mais {taxa_a} no segundo.",
    {taxa_b: rf("rate", "readings.options[id=$ob].spreadOverDi", "spread_sobre_cdi_do_programa"), taxa_a: rf("rate", "readings.options[id=$oa].spreadOverDi", "spread_sobre_cdi_do_programa")},
    {when: [...twoProgramsOnly, ...claim("as condições dos dois programas são indicativas e sobre o CDI, e são os dois primeiros programas do plano",
      cmp("$ob", "eq", at(RF, "result.funding.plan.steps[0].optionId")), cmp("$oa", "eq", at(RF, "result.funding.plan.steps[1].optionId")), ...["$oa", "$ob"].flatMap((x) => [
      cmp(at(RF, `result.funding.options[id=${x}].kind`), "eq", {value: "anchor_program"}),
      cmp(at(RF, `result.funding.options[id=${x}].indicative`), "eq", {value: "true"}), cmp(at(RF, `result.funding.options[id=${x}].rates.basis`), "eq", {value: "di_plus"})]))]}),
  // The source records no modality nor purpose for a credit line: the line is named generically and its terms stay pending.
  "topic.crop_overdraft": t("page.line", "Linha de crédito registrada com {credor}, com limite livre de {livre}; modalidade e finalidade: {termos}.",
    {credor: {type: "label", from: [[DT, "result.table.creditLines[id=$c].creditor"]], generic: "credor sem nome confirmado"},
      livre: s("money", DT, "result.table.creditLines[id=$c].unused", "balance"), termos: {type: "label", from: [[DT, "result.table.creditLines[id=$c].terms"]], generic: "a confirmar"}},
    {when: claim("a linha tem limite livre", cmp("livre", "gt", "0"))}),
  "alternatives.count": t("page.title", "Avaliamos {caminhos} caminhos {para:ano}; só o recomendado passa em todos os critérios",
    {caminhos: s("count", FP, "readings.horizon.candidatePaths"), ano: yr("$y")},
    {when: [maturityYear, {onlyFlagged: [FP, "readings.paths", "eligible", "id"], equals: at(FP, "readings.recommendation.pathId"), claim: "só o caminho recomendado passa em todos os critérios"}]}),
  // The paths by a generic label with their measures; their moves on the next page, each line the complete definition.
  "alternatives.row.no_line_debenture": pathRow("Caminho A", "sem-linha-debenture"),
  "alternatives.row.defer_line": pathRow("Caminho B", "adiar-linha"),
  "alternatives.row.debenture_with_line": pathRow("Caminho C", "debenture-com-linha"),
  "alternatives.row.keep_and_roll": pathRow("Caminho D", "manter"),
  "alternatives.row.short_bank_loan": pathRow("Caminho E", "ccb-tres-anos"),
  "alternatives.row.extend_with_bank": pathRow("Caminho F", "alongar-com-banco"),
  "alternatives.row.extend_bradesco": pathRow("Caminho G", "alongar-bradesco"),
  "alternatives.moves.title": t("page.title", "Os {caminhos} caminhos combinam estes movimentos da dívida e do projeto", {caminhos: s("count", FP, "readings.horizon.candidatePaths")}),
  "alternatives.moves.no_line_debenture": pathMovesLine("Caminho A: sem {projeto}; {bankcredit:sem-linha-debenture}; {species:nova:new@sem-linha-debenture}; pré-pagamento {species:atual_de:existing} e da dívida com {credor}.",
    "sem-linha-debenture", {added: [bankUnscheduled, "debenture_nova"], prepaid: ["debenture_atual", "$i"], variant: "other"}, claim("o caminho fica sem o projeto da linha", ...planVariant("sem-linha-debenture", "none")), true, "o"),
  // The plan's deferral: the path's variant is the reference variant moved uniformly (boardDeferralRules, fixed horizon).
  "alternatives.moves.defer_line": pathMovesLine("Caminho B: adiamento {projeto}; {bankcredit:adiar-linha}.", "adiar-linha", {added: [bankUnscheduled], variant: "other"},
    scenario("projeto adiado", ...planVariant("adiar-linha", "project"), {planDeferred: [FP, "$pv", "$pr"]}), false, "de"),
  // Otherwise: the variant by its verified components only, with no word of deferral.
  "alternatives.moves.defer_line_generic": pathMovesLine("Caminho B: outra variante {projeto}, com capex, EBITDA, depreciação, manutenção e capital de giro de partida começando depois dos do plano de referência; {bankcredit:adiar-linha}.",
    "adiar-linha", {added: [bankUnscheduled], variant: "other"},
    [...claim("a variante do caminho é de projeto, contra a variante de referência do caminho que mantém a dívida", ...planVariant("adiar-linha", "project")), ...claim("cada componente da variante começa estritamente depois do componente da variante de referência", ...["growthCapex", "ebitda", "depreciation", "maintenanceCapex", "startupWorkingCapitalCashFlow"].map((field) =>
      ({startsLater: [{contributed: [FP, `variant.$pv.${field}`]}, {contributed: [FP, `variant.$pr.${field}`]}]}) as BoardCondition))], false, "de"),
  "alternatives.moves.debenture_with_line": pathMovesLine("Caminho C: {projeto} no cronograma informado, com financiamento de banco de fomento; {bankcredit:debenture-com-linha}; {species:nova:new@debenture-com-linha}; pré-pagamento {species:atual_de:existing} e da dívida com {credor}.",
    "debenture-com-linha", {added: [bankUnscheduled, "fomento", "debenture_nova"], prepaid: ["debenture_atual", "$i"], variant: "same"}, [], true),
  "alternatives.moves.keep_and_roll": t("page.line", "Caminho D: dívida mantida como está, com {projeto} no cronograma informado.", {projeto: project("o")}, {when: [...keptDebt, ...sameProject]}),
  "alternatives.moves.short_bank_loan": pathMovesLine("Caminho E: financiamento bancário novo com amortização programada; {projeto} no cronograma informado.", "ccb-tres-anos",
    {added: [bankScheduled], variant: "same"}),
  "alternatives.moves.extend_with_bank": pathMovesLine("Caminho F: {projeto} no cronograma informado, com financiamento de banco de fomento; {bankcredit:alongar-com-banco}; financiamento bancário novo com amortização programada que pré-paga a dívida com {credor}; waiver {species:de:existing}.",
    "alongar-com-banco", {added: [bankUnscheduled, "fomento", bankScheduled], prepaid: ["$i"], charges: ["waiver|debenture_atual"], variant: "same"}, [], true),
  "alternatives.moves.extend_bradesco": pathMovesLine("Caminho G: {projeto} no cronograma informado, com financiamento de banco de fomento; {bankcredit:alongar-bradesco}; dívida com {credor} alongada por aditamento.",
    "alongar-bradesco", {added: [bankUnscheduled, "fomento", "aditamento"], removed: ["$i"], variant: "same"}, claim("a dívida nomeada é alongada: vencimento final posterior e menos principal pago", {extendsDebt: [FP, "$i"]}), true),
  "recommendation.debenture": t("page.title", "Recomendamos sondar {species:um:long} de até {valor}, com prazo de {prazo}", {valor: issue, prazo: term}, {when: [...longIsDebenture, ...upToTarget("valor")]}),
  "recommendation.debenture_cost": t("page.line", "Resgata {species:atual_o:existing} e pré-paga a dívida com {credor}; custo efetivo entre CDI mais {baixo} e CDI mais {alto}.",
    {credor: creditorOf("$i"), baixo: s("rate", FP, L + "equivalentSpread"), alto: s("rate", FP, L + "equivalentSpreadAtCondition")},
    {when: [...claim("a faixa vai do menor ao maior custo", cmp("baixo", "le", "alto")), ...claim("as leituras de pré-pagamento são do caminho recomendado", {bind: "p", to: at(FP, "readings.recommendation.pathId")}), prepaidIn("$p"),
      ...claim("o caminho recomendado tem exatamente estes movimentos, entre eles o pré-pagamento da debênture atual e da dívida nomeada",
        moves("$p", {added: [bankUnscheduled, "debenture_nova"], prepaid: ["debenture_atual", "$i"], variant: "other"}))]}),
  "recommendation.amortization": t("page.line", "Amortização {de:inicio} {a:fim}.",
    {inicio: s("date", FP, L + "firstAmortizationYear"), fim: s("date", FP, L + "lastAmortizationYear")}, {when: [...claim("o início vem antes do fim", cmp("inicio", "le", "fim")),
      // The span shown is the schedule's: first and last effective payments of the adopted profile of the recommended path.
      ...claim("o início e o fim são o primeiro e o último pagamento efetivo do perfil adotado", {bind: "p", to: at(FP, "readings.recommendation.pathId")},
        cmp("inicio", "eq", {firstPaid: [FP, schedule("adopted"), "year", "scheduledAmortization"]}), cmp("fim", "eq", {lastPaid: [FP, schedule("adopted"), "year", "scheduledAmortization"]}))]}),
  "recommendation.alternative": t("page.line", "Plano alternativo: sem {projeto}, {bankcredit:$alt} e financiamento bancário novo com amortização programada que pré-paga a dívida com {credor}, com waiver {species:de:existing}; decisão até {prazo}.",
    {projeto: project("o"), credor: creditorOf("$i"), prazo: dl("delib.action.decide_route")}, {when: [...bankFallback, ...sameProject]}),
  "risk.leverage": t("page.title", "A alavancagem chega a {adverso} no adverso {de:ano}, abaixo da política de {politica}{definition:politica:$ma}",
    {politica: policy, adverso: measurement("multiple", "$ma", "ratio"), ano: yr("$y")},
    {when: [...claim("o adverso fica abaixo da política", cmp("adverso", "lt", "politica")), adverseYear, adverseScenario, ...policyIsBoard, ...complies("$ma", "politica")]}),
  "risk.leverage_path": t("page.line", "A alavancagem fica em {inicio} {em:data_inicio} e em {fim} {em:data_fim}.",
    {inicio: measurement("multiple", "$mi", "ratio"), data_inicio: measurement("date", "$mi", "date"), fim: measurement("multiple", "$mf", "ratio"),
      data_fim: measurement("date", "$mf", "date")}, {when: [...claim("a alavancagem do fim é menor que a do início", cmp("fim", "lt", "inicio")), ...baseScenarioOf("$mi"), ...baseScenarioOf("$mf"),
      // Common base over time: the same scenario, role and definition (the same adjustments and the same limits tested);
      // the date and the period's values differ, and the sentence shows each date.
      ...claim("base comum no tempo: mesmo cenário, papel e definição (mesmos ajustes e limites testados); diferem a data e os valores do período",
        {sameBase: [CV, "result.headroom.measurements[id=$mi]", "result.headroom.measurements[id=$mf]"],
          differ: ["id", "label", "date", "debt", "cash", "netDebt", "reportedEbitda", "adjustments[*].amount", "ebitda", "ratio", "unrealizedEbitda", "tightestLimitId",
            "tests[*].breached", "tests[*].ebitdaHeadroom", "tests[*].netDebtHeadroom", "tests[*].unrealizedEbitdaLossToLimit"]})]}),
  "risk.leverage_adverse": t("page.line", "No adverso {de:ano}, chega a {adverso}, contra a política de {politica}{definition:politica:$ma}.",
    {ano: yr("$y"), adverso: measurement("multiple", "$ma", "ratio"), politica: policy}, {when: [adverseYear, adverseScenario, ...policyIsBoard, ...claim("o adverso fica abaixo da política", cmp("adverso", "lt", "politica")), ...complies("$ma", "politica")]}),
  // A breach the source registers for a limit the material shows is a material fact, in its own sentence: the
  // measurement (a registered test of that limit), its date and the limit.
  "risk.leverage_breach_covenant": t("page.line", "Com EBITDA de {ebitda} {em:data}, a alavancagem chega a {alavancagem} e passa o covenant de {covenant}.",
    {ebitda: measurement("money", "$mb", "reportedEbitda", "flow"), data: measurement("date", "$mb", "date"), alavancagem: measurement("multiple", "$mb", "ratio"), covenant},
    {when: [...claim("a fonte registra a violação do covenant nesta medição, teste registrado do limite", cmp(at(CV, "result.headroom.measurements[id=$mb].tests[limitId=aditamento].breached"), "eq", {value: "true"})),
      ...claim("a alavancagem passa o covenant", cmp("alavancagem", "gt", "covenant"))]}),
  "risk.leverage_breach_policy": t("page.line", "Com EBITDA de {ebitda} {em:data}, a alavancagem chega a {alavancagem} e passa a política de {politica}{definition:politica:$mb}.",
    {ebitda: measurement("money", "$mb", "reportedEbitda", "flow"), data: measurement("date", "$mb", "date"), alavancagem: measurement("multiple", "$mb", "ratio"), politica: policy},
    {when: [...claim("a fonte registra a violação da política nesta medição, teste registrado do limite", cmp(at(CV, "result.headroom.measurements[id=$mb].tests[limitId=politica].breached"), "eq", {value: "true"})),
      ...claim("a alavancagem passa a política", cmp("alavancagem", "gt", "politica"))]}),
  "risk.policy_definition": t("page.title", "A política de {politica} precisa de uma definição de EBITDA", {politica: policy}, {when: [...policyIsBoard, ...policyUndefined]}),
  "risk.policy_readings": t("page.line", "Pelo EBITDA gerencial, {gerencial}; pela definição da escritura, {escritura} {em:data}.",
    {gerencial: measurement("multiple", "$mg", "ratio"), escritura: measurement("multiple", "$me", "ratio"), data: measurement("date", "$me", "date")},
    {when: [...claim("as duas leituras são da mesma data", cmp(at(CV, "result.headroom.measurements[id=$mg].date"), "eq", "data")),
      // Roles by the registered record, never by identifier or by a numeric difference.
      ...claim("a leitura gerencial não registra ajuste ao EBITDA reportado", {atMost: [CV, "result.headroom.measurements[id=$mg].adjustments"], count: 0}),
      ...baseScenarioOf("$me"), ...contractualTest("$me"),
      // Common base: the same debt, cash, net debt, date and scenario; only the EBITDA (and what follows from it) differs.
      ...claim("base comum: mesma dívida, mesmo caixa, mesma dívida líquida, mesma data e mesmo cenário; só o EBITDA difere",
        {sameBase: [CV, "result.headroom.measurements[id=$mg]", "result.headroom.measurements[id=$me]"],
          differ: ["id", "label", "role", "reportedEbitda", "adjustments", "ebitda", "ratio", "unrealizedEbitda", "tests", "tightestLimitId"]})]}),
  "what_changes.title": t("page.title", "A recomendação depende de demanda a partir de {piso}",
    {piso: s("money", FP, L + "issueFloorInsideGates", "value")}, {when: [...claim("o piso não passa do alvo de emissão", cmp("piso", "le", at(FP, L + "issueTarget"))), ...inclusiveFloor("piso")]}),
  "what_changes.demand": t("page.line", "Demanda {species:de:long} abaixo de {piso}, o mínimo que mantém a emissão de {alvo} dentro dos critérios.",
    {piso: s("money", FP, L + "issueFloorInsideGates", "value"), alvo: issue}, {when: [...claim("o piso não passa do alvo", cmp("piso", "le", "alvo")), ...inclusiveFloor("piso"), ...longIsDebenture]}),
  "what_changes.wheat": t("page.line", "No cenário {insumo} {choque} mais caro com repasse em {defasagem}, o EBITDA {de:ano} fica em cerca de {ebitda}.",
    {insumo: input("de"), choque: s("rate", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate"),
      defasagem: s("months", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths"), ano: yr("$y"),
      ebitda: s("money", OP, "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=$y-12-31].ebitda", "flow")}, {when: wheatScenario("informado-trigo-4m")}),
  "what_changes.receivable_days": t("page.line", "No cenário de prazo maior de recebimento das redes, a variação do capital de giro {em:ano} fica {giro} acima da do cenário de referência.",
    {ano: yr("$y"), giro: s("money", OP, "readings.projected.scenarios[id=prazo-60].rows[periodId=$y-12-31].effects.changeInWorkingCapital", "flow")},
    {when: [...longerReceivables("prazo-60"), ...claim("o efeito sobre o capital de giro é de alta", cmp("giro", "gt", "0"))]}),
  "next_steps.title": t("page.title", "Próximos passos e datas"),
  "next_steps.notice": t("page.line", "{prazo}: aviso ao fornecedor {projeto}.", {prazo: dl("delib.action.supplier_notice"), projeto: project("de")}),
  "next_steps.programs": t("page.line", "{prazo}: adesão aos programas de antecipação.", {prazo: dl("delib.action.join_programs")}),
  "next_steps.sounding": t("page.line", "{prazo}: conclusão da sondagem {species:de:long}.", {prazo: dl("delib.action.finish_sounding")}),
  "next_steps.route": t("page.line", "{prazo}: decisão da rota para os vencimentos {de:ano}.", {prazo: dl("delib.action.decide_route"), ano: yr("$y")}, {when: [maturityYear]}),
  // Summary for prior reading.
  "summary.opening.debt_and_cash": t("summary.opening", "A companhia tem {principal} de dívida vencendo {em:ano} e um aperto de caixa já {em:semana}.",
    {principal: s("money", DT, "result.table.profile.scheduleByYear[year=$y].principal", "flow"), ano: yr("$y"), semana: tightWeek}, {when: [tightBelowMinimum]}),
  "summary.closing.leverage": t("summary.closing", "A alavancagem fica em {alavancagem} {em:data} e abaixo de {politica} nos cenários avaliados{definition:politica:all}.",
    {alavancagem: measurement("multiple", "$ms", "ratio"), data: measurement("date", "$ms", "date"), politica: policy}, {when: [allBelowPolicy, ...policyIsBoard, ...baseScenarioOf("$ms"), ...complies(null, "politica"), ...complies("$ms", "politica")]}),
  // Appendix.
  "appendix.debt_table": t("appendix", "Tabela de dívida"),
  "appendix.projection": t("appendix", "Projeção por drivers e premissas"),
  "appendix.plan_vs_base": t("appendix", "Plano da área financeira contra a base"),
  "appendix.sources": t("appendix", "Fontes e datas das análises"),
  // Likely questions and answers; an answer answers its own question.
  "q.roll_bank": t("question", "Por que não rolar a dívida com {credor} no vencimento?", {credor: creditorOf("$i")}),
  "a.roll_bank": t("answer", "No caminho sem {projeto}, com {bankcredit:bradesco-sem-linha} e a dívida com {credor} alongada por aditamento, o caixa fica abaixo do mínimo da política: faltam cerca de {falta}, com vencimento {em:vencimento}.",
    {projeto: project("o"), credor: creditorOf("$i"), falta: s("money", FP, "result.evaluation.paths[id=bradesco-sem-linha].shortfallVsPolicyMinimum", "balance"), vencimento: s("date", DT, "result.table.rows[id=$i].finalPayment")},
    {answers: "q.roll_bank", when: [...claim("falta caixa contra o mínimo da política", cmp("falta", "gt", "0")),
      ...claim("o caminho tem exatamente estes movimentos", moves("bradesco-sem-linha", {added: [bankUnscheduled, "aditamento"], removed: ["$i"], variant: "other"}), ...planVariant("bradesco-sem-linha", "none"), {extendsDebt: [FP, "$i"]}), ...sameProject]}),
  "q.term": t("question", "Por que {prazo} e não um prazo menor?", {prazo: term}),
  "a.term": t("answer", "Num perfil de amortização testado que termina antes do adotado, a amortização {de:ano}, de {amortizacao}, passa o caixa disponível depois dos juros, de {disponivel}; o perfil adotado passa em todo o horizonte.",
    {ano: yr("$y"), amortizacao: s("money", FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].years[year=$y].scheduledAmortization", "flow"),
      disponivel: s("money", FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].years[year=$y].availableAfterInterest", "flow")},
    {answers: "q.term", when: [...claim("as leituras são do caminho recomendado", cmp("$p", "eq", at(FP, "readings.recommendation.pathId"))),
      ...claim("a amortização supera o caixa disponível no ano mostrado, o primeiro em que o perfil falha", cmp("amortizacao", "gt", "disponivel"),
        cmp(at(FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].firstShortfallYear"), "eq", "ano")),
      ...claim("o perfil testado falha e o adotado passa", cmp(at(FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=cinco-anos].passes"), "eq", {value: "false"}),
        cmp(at(FP, "result.evaluation.paths[id=$p].amortizationTests[profileId=adopted].passes"), "eq", {value: "true"})),
      // "Mais curto": the tested profile's last effective payment comes before the adopted one's, by the years of the
      // schedules, and the tested schedule is known to end (its last payment is not its last listed year).
      ...claim("o perfil testado termina antes do adotado: último pagamento efetivo anterior, pelas datas dos dois cronogramas",
        cmp({lastPaid: [FP, schedule("cinco-anos"), "year", "scheduledAmortization"]}, "lt", {lastPaid: [FP, schedule("adopted"), "year", "scheduledAmortization"]}),
        cmp({lastPaid: [FP, schedule("cinco-anos"), "year", "scheduledAmortization"]}, "lt", {lastListed: [FP, schedule("cinco-anos"), "year"]}))]}),
  "q.demand": t("question", "E se as gestoras não comprarem o volume todo?"),
  "a.demand": t("answer", "Plano alternativo: sem {projeto}, {bankcredit:$alt} e financiamento bancário novo de cerca de {valor}, com amortização programada, que pré-paga a dívida com {credor}, com waiver e anuência dos {species:titulares:existing}, decidido até {prazo}, antes do vencimento dessa dívida {em:vencimento}.",
    {projeto: project("o"), valor: s("money", FP, "readings.alternative.issueTarget", "value"), prazo: dl("delib.action.decide_route"), credor: creditorOf("$i"), vencimento: s("date", DT, "result.table.rows[id=$i].finalPayment")},
    {answers: "q.demand", when: [...bankFallback, ...claim("a decisão vem antes do vencimento", cmp("prazo", "lt", "vencimento")), ...sameProject]}),
  "q.cost": t("question", "Quanto custa?"),
  "a.cost": t("answer", "Custo efetivo entre CDI mais {baixo} e CDI mais {alto}; custo financeiro de cerca de {custo} {ate:ano}, com dívida líquida de {divida} {fim:ano_fim}.",
    {baixo: s("rate", FP, L + "equivalentSpread"), alto: s("rate", FP, L + "equivalentSpreadAtCondition"), custo: s("money", FP, "readings.recommendation.horizonFinancingCost", "flow"),
      ano: yr("$y"), divida: s("money", FP, "readings.recommendation.netDebtAtHorizon", "balance"), ano_fim: yr("$y")},
    {answers: "q.cost", when: [...claim("a faixa vai do menor ao maior custo", cmp("baixo", "le", "alto")), horizonYear,
      ...claim("o horizonte termina no último dia do ano mostrado: até o ano inclui exatamente o horizonte", cmp(at(FP, "readings.horizon.lastPeriodEnd"), "eq", {value: "$y-12-31"}))]}),
  "q.peer": t("question", "Por que pagamos mais que a concorrente?"),
  // A decomposition without causal attribution is reported as such: the known adjustments, the one of the pricing date,
  // and what the source leaves unexplained; no sentence turns the remainder into an explanation.
  "a.peer": t("answer", "Da diferença de {total}, os ajustes conhecidos somam {ajustes}, dos quais {data} de ajuste pela data de contratação; {resto} ficam sem explicação na comparação.",
    {total: s("bps", RC, "decomposition.grossBps"), ajustes: s("bps", RC, "result.bridge.knownAdjustmentsBps"), data: s("bps", RC, "result.bridge.steps[family=pricing_date].bps"),
      resto: s("bps", RC, "result.bridge.unexplainedAfterKnownAdjustmentsBps")},
    {answers: "q.peer", when: [...claim("a parcela da data cabe nos ajustes e os ajustes cabem na diferença", cmp("data", "le", "ajustes"), cmp("ajustes", "le", "total")),
      ...claim("a ponte não atribui causa ao restante", cmp(at(RC, "result.bridge.causalAttribution"), "eq", {value: "false"})),
      ...claim("o restante sem explicação é o que a fonte registra", cmp("resto", "gt", "0"))]}),
  "q.rating": t("question", "Vale contratar rating?"),
  "a.rating": t("answer", "Pelo spread, o ganho líquido fica entre {baixo} e {alto}; a decisão depende do acesso a investidores {species:de:long}. Sugerimos ouvir uma agência de rating antes de decidir.",
    {baixo: s("money", RC, "levers[role=rating&scenario=low].netOfKnownCosts", "flow"), alto: s("money", RC, "levers[role=rating&scenario=high].netOfKnownCosts", "flow")},
    {answers: "q.rating", when: [...claim("os dois extremos da faixa cobrem o mesmo horizonte registrado", {samePeriod: ["baixo", "alto"]}),
      ...claim("a faixa vai do menor ao maior ganho", cmp("baixo", "le", "alto")), ...ratingCoverage("complete_for_stated_horizon")]}),
  // With incomplete cost coverage the benefit is net of the known costs only, and the sentence says the costs are pending.
  "a.rating_known_costs": t("answer", "Pelo spread, o ganho líquido dos custos conhecidos fica entre {baixo} e {alto}, com custos ainda não levantados; a decisão depende do acesso a investidores {species:de:long}. Sugerimos ouvir uma agência de rating antes de decidir.",
    {baixo: s("money", RC, "levers[role=rating&scenario=low].netOfKnownCosts", "flow"), alto: s("money", RC, "levers[role=rating&scenario=high].netOfKnownCosts", "flow")},
    {answers: "q.rating", when: [...claim("os dois extremos da faixa cobrem o mesmo horizonte registrado", {samePeriod: ["baixo", "alto"]}),
      ...claim("a faixa vai do menor ao maior ganho", cmp("baixo", "le", "alto")), ...ratingCoverage("incomplete")]}),
  "q.strategic": t("question", "{projeto} não é um investimento estratégico?", {projeto: project("O")}),
  "a.strategic": t("answer", "O retorno de {retorno} fica acima do custo de capital de {custo}, mas o VPL fica negativo nos cenários de economia menor, de capex e depreciação maiores e de partida mais lenta. As cotações decidem.",
    {retorno: metric("rate", "base", "annualIrr"), custo: metric("rate", "base", "discountRate")},
    {answers: "q.strategic", nearlyEqual: "O retorno de {retorno} fica praticamente igual ao custo de capital de {custo}, e o VPL fica negativo nos cenários de economia menor, de capex e depreciação maiores e de partida mais lenta. As cotações decidem.", when: [...claim("o retorno supera o custo de capital", cmp("retorno", "gt", "custo")),
      ...claim("o VPL é negativo nas três sensibilidades", ...["economy-4", "capex-120", "slower-start"].map((x) => cmp(at(IP, `comparison.metrics[caseId=${x}].netPresentValue`), "lt", "0"))),
      ...smallerEconomy, ...largerCapex, ...slowerStart]}),
  "q.wheat": t("question", "E se o custo {insumo} subir?", {insumo: input("de")}),
  "a.wheat": t("answer", "No cenário {insumo} {choque} mais caro com repasse em {defasagem}, o EBITDA {de:ano} fica em cerca de {ebitda}; no adverso, com EBITDA de {ebitda_adverso}, a alavancagem fica em {alavancagem}, abaixo do covenant de {covenant}{definition:aditamento:$ma}.",
    {insumo: input("de"), choque: s("rate", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.rate"),
      defasagem: s("months", OP, "result.projection.projection.scenarios[id=informado-trigo-4m].inputCostShock.passThroughLagMonths"), ano: yr("$y"),
      ebitda: s("money", OP, "readings.projected.scenarios[id=informado-trigo-4m].rows[periodId=$y-12-31].ebitda", "flow"),
      ebitda_adverso: measurement("money", "$ma", "reportedEbitda", "flow"), alavancagem: measurement("multiple", "$ma", "ratio"), covenant},
    {answers: "q.wheat", when: [...wheatScenario("informado-trigo-4m"),
      ...claim("a alavancagem adversa fica abaixo do covenant", cmp("alavancagem", "lt", "covenant")), adverseScenario,
      // Temporal coherence: the adverse measurement is of the year the projection announces.
      adverseYear,
      ...claim("o covenant é contratual e está em vigor", cmp(at(CV, "result.headroom.limits[id=aditamento].kind"), "eq", {value: "contractual"}),
        cmp(at(CV, "result.headroom.limits[id=aditamento].status"), "eq", {value: "in_force"})), ...complies("$ma", "aditamento")]}),
  // A debtor is named by the debtor key of its item; its balance, contract and program follow the same item, and the
  // program is the anchor program the source links to that item.
  "q.anchor": t("question", "Dependemos demais de {rede}?", {rede: {type: "debtor", from: [[RF, "result.funding.portfolio.items[itemId=$d].label"]], generic: "um único cliente"}}),
  // The volume a debtor can anticipate is the program's figure for that debtor (byItem), never the program's total. The
  // program is called the debtor's own only when the source links it to that debtor alone; otherwise it has no owner.
  "a.anchor": t("answer", "A carteira tem {saldo} de {rede}, de um total de {carteira}; o contrato com esse cliente veda a cessão sem consentimento, mas o programa próprio dele antecipa {volume} sem regresso, a CDI mais {taxa}.",
    anchorSlots, {answers: "q.anchor", when: [...anchorCommon, ...claim("o programa é ligado na fonte só a esse cliente", {contributedHas: [RF, "option.$o.anchorItemIds"], value: {var: "d"}, only: true})]}),
  "a.anchor_shared": t("answer", "A carteira tem {saldo} de {rede}, de um total de {carteira}; o contrato com esse cliente veda a cessão sem consentimento, mas um programa de antecipação aceita {volume} desses recebíveis sem regresso, a CDI mais {taxa}.",
    anchorSlots, {answers: "q.anchor", when: [...anchorCommon, ...claim("o programa é ligado na fonte a esse cliente", {contributedHas: [RF, "option.$o.anchorItemIds"], value: {var: "d"}})]}),
  "q.plan_vs_base": t("question", "O plano da área financeira mostra EBITDA de {plano} {em:ano}; por que usamos {base}?",
    {plano: s("money", PC, "readings.gap.plan.ebitda", "flow"), ano: yr("$y"), base: s("money", PC, "readings.gap.reference.ebitda", "flow")},
    {when: [...claim("o ano é o alvo do plano", cmp("ano", "eq", at(PC, "readings.gap.targetPeriodId"))), ...claim("o plano supera a base", cmp("plano", "gt", "base"))]}),
  "a.plan_vs_base": t("answer", "O plano supõe preço, volume e custos fixos sem evidência apresentada, e o volume passa a capacidade da fábrica sem investimento. A base por drivers fica em {base}.",
    {base: s("money", PC, "readings.gap.reference.ebitda", "flow")},
    {answers: "q.plan_vs_base", when: [
      ...claim("preço, volume e custos fixos são premissas do plano sem evidência apresentada, pelos drivers registrados", ...["netUnitPrice", "quantity", "fixedCosts"].map((x) => has(PC, "readings.assumptions", "drivers[0].driver", x)),
        {every: [PC, "readings.assumptions", "evidenceStatus"], op: "eq", than: {value: "not_presented"}}),
      ...claim("o volume passa a capacidade sem investimento no plano", cmp(at(PC, "readings.capacity.aboveWithoutInvestment"), "eq", {value: "true"}),
        cmp(at(PC, "readings.capacity.investmentInPlan"), "eq", {value: "false"}))]}),
  // Topics, pending notes, requesters and authority bases.
  // Topics carry no reading, so they never name an object of a vocabulary: the generic words stand.
  "topic.packaging_review": t("topic", "revisão do projeto de investimento"),
  "topic.crop_financing": t("topic", "financiamento do capital de giro"),
  "note.program_indicative": t("note", "Condições dos programas de antecipação indicativas até a confirmação do banco de cada programa",
    {}, {when: [...twoProgramsOnly, ...claim("as condições dos dois primeiros programas do plano são indicativas", {bind: "ofirst", to: at(RF, "result.funding.plan.steps[0].optionId")},
      {bind: "osecond", to: at(RF, "result.funding.plan.steps[1].optionId")}, ...["$ofirst", "$osecond"].map((o) => cmp(at(RF, `result.funding.options[id=${o}].indicative`), "eq", {value: "true"})))]}),
  "note.credit_line_terms_not_registered": t("note", "A tabela de dívida não registra modalidade nem finalidade da linha de crédito"),
  "note.case_not_reviewed": t("note", "A opção não está entre os casos revisados da análise do projeto", {}, {when: claim("a opção em etapas não é caso revisado", lacks(IP, "comparison.metrics", "caseId", "staged"))}),
  "requester.chair": t("requester", "Presidente do conselho"),
  "requester.cfo": t("requester", "Diretor financeiro"),
  "authority.board_policy": t("authority", "Política de endividamento aprovada pelo conselho", {}, {when: policyIsBoard}),
};
/** Roles proved by the registered record, for every template at once: a measurement shown is a registered test, never
 * a contrast; the case shown as going on now is the case of registered role base. */
for (const template of Object.values(boardTemplates)) {
  const paths = Object.values(template.slots).flatMap((x) => x.from ?? []).map(([, path]) => path);
  const measured = [...new Set(paths.flatMap((x) => {const m = /^result\.headroom\.measurements\[id=([$a-z0-9-]+)\]/.exec(x); return m ? [m[1]!] : [];}))];
  const added: BoardCondition[] = [
    ...measured.flatMap((id) => claim("a medição mostrada é um teste registrado, não um contraste", cmp(at(CV, `result.headroom.measurements[id=${id}].role`), "eq", {value: "test"}))),
    ...paths.some((x) => x.startsWith("comparison.metrics[caseId=base].")) ? claim("o caso mostrado como seguir agora é o caso de papel base registrado", cmp(at(IP, "comparison.metrics[caseId=base].role"), "eq", {value: "base"})) : []];
  // A flow whose registry gives its row's interval, in a sentence that announces a year: the interval is that year.
  const yearSlots = Object.entries(template.slots).filter(([, x]) => x.year !== undefined).map(([k]) => k);
  for (const [slot, spec] of Object.entries(template.slots)) {
    const [method, path] = spec.from?.[0] ?? [];
    if (method && path && boardFieldOf(method, path.replace(/\[[^\]]+\]/g, "[*]"))?.interval && yearSlots.length === 1)
      added.push(...claim("o intervalo registrado do fluxo é exatamente o ano anunciado", {coversYear: [slot, yearSlots[0]!]}));
  }
  if (added.length) template.when = [...template.when, ...added];
}
/** Frozen, deeply, once complete: no running code (tests included) can change the library; a test exercises a changed
 * library by passing it explicitly to the self-check or to a single render, never by replacing the production one. */
export function boardDeepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {Object.freeze(value); for (const x of Object.values(value as Record<string, unknown>)) boardDeepFreeze(x);}
  return value;
}
boardDeepFreeze(boardTemplates);

/** The material assertions of the library, template by template: each claim of a fixed text with the verifiable
 * fields and the condition that sustain it. A template whose fixed text asserts nothing beyond its readings has none. */
/** The closed set of themes: a decision's subject (the packaging line, the crop working capital, the maturities, the
 * debt policy) or "geral" for what serves every decision (the company's situation, constraints, the decisions page,
 * the calendar, the summary's frame, the appendix, requesters and authority). */
export const boardThemes = ["linha-embalagem", "safra", "vencimentos", "politica", "geral"] as const;
export type BoardTheme = (typeof boardThemes)[number];
/** Each template's theme, declared by the library and never adopted: a page, deliberation or summary item has the theme of
 * its templates. Explicit entries first, then the template family. */
const themeByTemplate: Record<string, BoardTheme> = {
  "delib.action.supplier_notice": "linha-embalagem", "delib.action.join_programs": "safra", "delib.action.finish_sounding": "vencimentos", "delib.action.decide_route": "vencimentos",
  "note.case_not_reviewed": "linha-embalagem", "note.program_indicative": "safra", "note.credit_line_terms_not_registered": "safra",
  "topic.packaging_review": "linha-embalagem", "topic.crop_financing": "safra", "risk.policy_definition": "politica", "risk.policy_readings": "politica", "risk.leverage_path": "geral",
  "q.strategic": "linha-embalagem", "a.strategic": "linha-embalagem", "q.anchor": "safra", "a.anchor": "safra", "a.anchor_shared": "safra",
  "q.wheat": "geral", "a.wheat": "geral", "q.plan_vs_base": "geral", "a.plan_vs_base": "geral",
};
const themeByFamily: [RegExp, BoardTheme][] = [
  [/^(delib\.packaging_line|topic\.project_|option\.)/, "linha-embalagem"], [/^(delib\.crop|topic\.crop_)/, "safra"],
  [/^(delib\.maturities|alternatives\.|recommendation\.|risk\.leverage|what_changes\.|[qa]\.(roll_bank|term|demand|cost|peer|rating))/, "vencimentos"],
  [/^delib\.policy/, "politica"],
  [/^(page\.|situation\.|constraint\.|next_steps\.|summary\.|appendix\.|requester\.|authority\.)/, "geral"],
];
export function boardTemplateTheme(templateId: string): BoardTheme | null {
  return themeByTemplate[templateId] ?? themeByFamily.find(([re]) => re.test(templateId))?.[1] ?? null;
}
/** The theme of a set of texts (template refs): the one decision theme among them, "geral" when all serve every decision,
 * null when two decision themes mix or a template has no theme. */
export function boardThemeOfRefs(refs: readonly string[]): BoardTheme | null {
  const themes = refs.map((r) => boardTemplateTheme(r.split("|")[0]!));
  if (themes.some((x) => x === null)) return null;
  const decision = [...new Set(themes.filter((x) => x !== "geral"))];
  return decision.length > 1 ? null : decision[0] ?? "geral";
}

export function boardTemplateClaims() {
  const describe = (o: BoardOperand): string => "slot" in o ? `posição ${o.slot}` : "value" in o ? `"${o.value}"` : "var" in o ? `$${o.var}`
    : "firstPaid" in o ? `primeiro pagamento efetivo de ${o.firstPaid[0]} ${o.firstPaid[1]} (${o.firstPaid[3]} não nulo, por ${o.firstPaid[2]})`
    : "lastPaid" in o ? `último pagamento efetivo de ${o.lastPaid[0]} ${o.lastPaid[1]} (${o.lastPaid[3]} não nulo, por ${o.lastPaid[2]})`
    : "lastListed" in o ? `último ${o.lastListed[2]} listado em ${o.lastListed[0]} ${o.lastListed[1]}`
    : "at" in o ? `${o.at[0]} ${o.at[1]}${o.year ? " (ano)" : ""}` : `contrato ${o.contributed[0]} ${o.contributed[1]}`;
  const series = (x: BoardSeries) => "list" in x ? `${x.list[0]} ${x.list[1]}[*].${x.field} por ${x.key}` : "contributed" in x ? `termo adotado ${x.contributed[0]} ${x.contributed[1]}`
    : "projectionRows" in x ? `${x.projectionRows[0]} cenário ${x.projectionRows[1]} linhas .${x.field}` : `${x.projectionDriver[0]} driver ${x.projectionDriver[2]} do cenário ${x.projectionDriver[1]} (ou do cenário de que deriva)`;
  const check = (c: BoardCondition): string => "compare" in c ? `${describe(c.compare[0])} ${c.compare[1]} ${describe(c.compare[2])}`
    : "every" in c ? `todo ${c.every[0]} ${c.every[1]}[*].${c.every[2]} ${c.op} ${describe(c.than)}`
    : "onlyFlagged" in c ? `só um de ${c.onlyFlagged[0]} ${c.onlyFlagged[1]} com ${c.onlyFlagged[2]}, ${c.onlyFlagged[3]} = ${describe(c.equals)}`
    : "largest" in c ? `maior ${c.largest[2]} em ${c.largest[0]} ${c.largest[1]} tem ${c.largest[3]} = ${describe(c.equals)}`
    : "bind" in c ? `$${c.bind} := ${describe(c.to)}` : "atLeast" in c ? `${c.atLeast[0]} ${c.atLeast[1]} tem ao menos ${c.count}`
    : "dominates" in c ? `série ${series(c.dominates[0])} ${c.op === "gt" ? "domina por cima" : c.op === "lt" ? "domina por baixo" : "igual a"} ${series(c.dominates[1])}`
    : "contributedHas" in c ? `termo adotado ${c.contributedHas[0]} ${c.contributedHas[1]} ${c.none ? "não contém" : c.only ? "é só" : "contém"} ${describe(c.value)}`
    : "atMost" in c ? `${c.atMost[0]} ${c.atMost[1]} tem no máximo ${c.count}`
    : "changedOnly" in c ? `objeto de entrada inteiro ${c.changedOnly[0]} ${c.changedOnly[1]} difere de ${c.changedOnly[2]} exatamente em ${c.fields.join(", ")}; ignorados: ${boardInputIgnored.join(", ")}`
    : "coversYear" in c ? `o intervalo registrado da linha de ${c.coversYear[0]} (início e fim) é exatamente o ano de ${c.coversYear[1]}`
    : "sameBase" in c ? `os registros ${c.sameBase[1]} e ${c.sameBase[2]} de ${c.sameBase[0]} são iguais em todo campo, exceto ${c.differ.join(", ")}`
    : "boundary" in c ? `o campo de ${c.boundary[0]} é limite ${c.boundary[1] === "minimum" ? "mínimo" : "máximo"} registrado ${c.boundary[2] ? "inclusivo (o próprio valor é admitido)" : "exclusivo"}`
    : "largestGroup" in c ? `agrupando todos os elementos de ${c.largestGroup[0]} ${c.largestGroup[1]} por ${c.largestGroup[2]}, o maior total de ${c.largestGroup[3]} é único e é ${describe(c.equals)}`
    : "joinedCount" in c ? `exatamente ${c.count} elementos de ${c.joinedCount[0]} ${c.joinedCount[1]} (todos, não só os primeiros) apontam, por ${c.joinedCount[2]}, para ${c.joinedCount[3]} com ${c.joinedCount[4]} em [${c.joinedCount[5].join(", ")}]`
    : "samePeriod" in c ? `as posições ${c.samePeriod[0]} e ${c.samePeriod[1]} cobrem o mesmo período registrado`
    : "testsLimit" in c ? (c.testsLimit[1] === null ? `nenhum teste registrado do limite ${c.testsLimit[2]} em ${c.testsLimit[0]} está violado` : `a medição ${c.testsLimit[1]} de ${c.testsLimit[0]} é teste registrado do limite ${c.testsLimit[2]}, não violado, e nenhum teste desse limite na mesma data e cenário está violado`)
    : "planDeferred" in c ? `variante ${c.planDeferred[1]} de ${c.planDeferred[0]} é a variante ${c.planDeferred[2]} deslocada uniformemente em k períodos dentro do horizonte do plano (k ao menos um), série a série pelas regras declaradas, sem mudança de magnitude; o resto igual, rótulo à parte`
    : "deferredBy" in c ? `objeto de entrada inteiro ${c.deferredBy[0]} ${c.deferredBy[1]} é ${c.deferredBy[2]} deslocado uniformemente em k períodos (k ao menos um), série a série pelas regras declaradas; ignorados: ${boardInputIgnored.join(", ")}`
    : "scenarioDefines" in c ? `objeto de entrada inteiro do cenário ${c.scenarioDefines[1]} de ${c.scenarioDefines[0]} define exatamente ${c.drivers.join(", ")} contra o cenário de que deriva (origem do valor ignorada)`
    : "atKey" in c ? `${series(c.atKey[0])} ${c.op} ${series(c.atKey[1])} em ${describe(c.key)}`
    : "startsLater" in c ? `${series(c.startsLater[0])} começa estritamente depois de ${series(c.startsLater[1])}`
    : "extendsDebt" in c ? `um instrumento aditado substitui ${c.extendsDebt[1]} em ${c.extendsDebt[0]}, com vencimento final posterior e menos principal pago em cada período`
    : "sameObject" in c ? `${c.sameObject[0]} ${c.sameObject[1]}${c.where ? ` (onde ${c.where[0]} = "${c.where[1]}")` : ""}: todo rótulo é igual, campo inteiro, a um rótulo canônico do mesmo termo de ${c.vocabulary} da posição ${c.slot}`
    : "registeredTerm" in c ? `algum texto registrado ${c.registeredTerm[0]} ${c.registeredTerm[1]} nomeia "${c.term}" (${c.vocabulary})`
    : "pathMoves" in c ? `movimentos do caminho ${c.pathMoves[1]} de ${c.pathMoves[0]} contra o status quo: novos [${c.added.join(", ")}], retirados [${c.removed.join(", ")}], pré-pagos [${c.prepaid.join(", ")}], encargos [${c.charges.join(", ")}], variante ${c.variant === "same" ? "igual" : "diferente"}`
    : `${c.includes[0]} ${c.includes[1]}${c.includes[2] ? `[*].${c.includes[2]}` : ""} ${c.none ? "não contém" : c.only ? "é só" : "contém"} ${describe(c.value)}`;
  const rows: {templateId: string; claim: string; checks: string[]}[] = [];
  for (const [templateId, x] of Object.entries(boardTemplates)) for (const c of x.when) {
    const text = c.claim ?? "(sem nome)", row = rows.find((r) => r.templateId === templateId && r.claim === text);
    if (row) row.checks.push(check(c)); else rows.push({templateId, claim: text, checks: [check(c)]});
  }
  return rows;
}

/** The closed dictionary of names a material may show, in canonical spelling: financial institutions and named
 * counterparties. A source label is shown only when it equals an entry exactly; otherwise the slot shows its
 * generic words and the material records a gap of name. */
export const boardNameDictionary = ["Itaú", "Bradesco", "Santander", "Banco do Brasil", "Caixa", "BTG Pactual", "Banco Safra", "BNDES", "XP", "Sicredi", "Sicoob", "Banrisul",
  "Citi", "JPMorgan", "Debenturistas", "rede A", "rede B"] as const;
/** Counterparties the fixed texts of this library describe by role (the retail chains of the receivables programs); never a creditor. */
export const boardNamesAllowedInText: readonly string[] = [];

/** A text reference as adopted: `template|slot=reading|slot=deadline:deliberation.deadline`. */
export const boardTextRefPattern = /^[a-z][a-z0-9_.]{0,79}(?:\|[a-z][a-z0-9_]{0,30}=(?:deadline:|informed:)?[a-z0-9][a-z0-9.-]{0,80})*$/;
export type BoardTextRef = {templateId: string; bindings: Record<string, string>};
/** Parses one reference by name: unknown template, a missing, unknown or repeated slot is refused. */
export function parseBoardTextRef(ref: string, library: Readonly<Record<string, BoardTemplate>> = boardTemplates): BoardTextRef & {template: BoardTemplate} {
  if (!boardTextRefPattern.test(ref)) throw new Error(`board_capital_text_ref_invalid:${ref.slice(0, 80)}`);
  const [templateId, ...pairs] = ref.split("|");
  const template = Object.hasOwn(library, templateId!) ? library[templateId!] : undefined;
  if (!template) throw new Error(`board_capital_template_unknown:${templateId}`);
  const bindings: Record<string, string> = {};
  for (const pair of pairs) {
    const at = pair.indexOf("="), slot = pair.slice(0, at);
    if (!Object.hasOwn(template.slots, slot) || Object.hasOwn(bindings, slot)) throw new Error(`board_capital_slot_invalid:${templateId}:${slot}`);
    bindings[slot] = pair.slice(at + 1);
  }
  for (const slot of Object.keys(template.slots)) if (!Object.hasOwn(bindings, slot)) throw new Error(`board_capital_slot_unbound:${templateId}:${slot}`);
  return {templateId: templateId!, bindings, template};
}
/** The reading ids a reference binds (deadlines excluded). */
export function boardRefReadingIds(ref: string): string[] {
  const parsed = parseBoardTextRef(ref);
  return Object.entries(parsed.bindings).filter(([slot]) => !["deadline", "informed"].includes(parsed.template.slots[slot]!.type)).map(([, id]) => id);
}

/** Splits a path into its keys and selectors, the same way the reader does. */
export function boardPathSegments(path: string) {
  return path.split(/\.(?![^[]*\])/).map((raw) => {
    const m = /^([A-Za-z0-9_]+)((?:\[[^\]]+\])*)$/.exec(raw);
    if (!m) return null;
    return {key: m[1]!, selectors: (m[2]!.match(/\[[^\]]+\]/g) ?? []).map((x) => x.slice(1, -1))};
  });
}
const escape = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Matches one value against a pattern with `$var` tokens; returns the captured variables or null. */
export function boardMatchValue(pattern: string, value: string): Record<string, string> | null {
  const names: string[] = [];
  const source = pattern.split(/(\$[a-z]+)/).map((part) => part.startsWith("$") ? (names.push(part.slice(1)), "(.+?)") : escape(part)).join("");
  const m = new RegExp(`^${source}$`).exec(value);
  if (!m) return null;
  const vars: Record<string, string> = {};
  for (const [i, name] of names.entries()) {
    if (Object.hasOwn(vars, name) && vars[name] !== m[i + 1]) return null;
    vars[name] = m[i + 1]!;
  }
  return vars;
}
/** Matches a reading's path against an admissible path: same keys, same selector fields, values literal or `$var`. */
export function boardMatchPath(pattern: string, path: string): Record<string, string> | null {
  const a = boardPathSegments(pattern), b = boardPathSegments(path);
  if (a.length !== b.length || a.some((x) => !x) || b.some((x) => !x)) return null;
  const vars: Record<string, string> = {};
  for (const [i, x] of a.entries()) {
    const y = b[i]!;
    if (x!.key !== y.key || x!.selectors.length !== y.selectors.length) return null;
    for (const [j, sel] of x!.selectors.entries()) {
      const other = y.selectors[j]!, at = sel.indexOf("="), atOther = other.indexOf("=");
      if (at < 1 || atOther < 1 || sel.slice(0, at) !== other.slice(0, atOther)) return null;
      const got = boardMatchValue(sel.slice(at + 1), other.slice(atOther + 1));
      if (!got) return null;
      for (const [k, v] of Object.entries(got)) {if (Object.hasOwn(vars, k) && vars[k] !== v) return null; vars[k] = v;}
    }
  }
  return vars;
}

/** The library checks itself: every condition names slots and variables the template has, every deadline slot an
 * action of the library, every deliberation text a title, every answer a question. */
/** Qualifying words of an object in the fixed text (templates, the "praticamente igual" wording, slot generics). Each
 * occurrence must sit in a registered phrase whose proof the template carries: a condition or a slot reading the field
 * named (regular expression over the template's slots and conditions), the question form (a question asserts nothing),
 * the declared wording of two shown values equal on display, or the generic words written only with a gap. A word of the
 * watch list outside every registered phrase, or with its proof absent, is refused by the library self-check. */
export type BoardQualifierProof = RegExp | "question" | "nearly_equal" | "gap";
export const boardQualifiers: readonly {words: readonly string[]; phrase: RegExp; field: string; rule: string; proof: BoardQualifierProof}[] = [
  {words: ["testado", "adotado"], phrase: /perfil de amortização testado que termina antes do adotado|o perfil adotado/, field: "amortizationTests[profileId=cinco-anos|adopted]", rule: "os dois perfis registrados do caminho recomendado", proof: /profileId=adopted/},
  {words: ["abaixo", "mínimo"], phrase: /caixa fica abaixo do mínimo/, field: "project-weekly-cash readings.tightestWeek.belowMinimum | evaluate-financing-paths shortfallVsPolicyMinimum", rule: "abaixo do mínimo registrado (belowMinimum verdadeiro, ou falta contra o mínimo maior que zero)", proof: /belowMinimum"\]\},"eq",\{"value":"true"\}|shortfallVsPolicyMinimum.*\{"slot":"falta"\},"gt",\{"value":"0"\}/},
  {words: ["abaixo"], phrase: /\{[a-z_]+\}[^;.]*abaixo d[aoe]s? (?:política de |covenant de )?\{[a-z_]+\}|abaixo de \{politica\} nos cenários avaliados/, field: "os dois valores mostrados", rule: "comparação estrita registrada entre os valores (lt), em exato e no exibido", proof: /,"lt",\{"slot"|"op":"lt","than":\{"slot"/},
  {words: ["abaixo", "mínimo"], phrase: /Demanda \{species:[^}]+\} abaixo de \{piso\}, o mínimo/, field: "readings.recommendation.longInstrument.issueFloorInsideGates (limite mínimo inclusivo registrado)", rule: "abaixo do piso: um montante menor que o piso falha nos critérios; o próprio piso passa (boundary minimum inclusivo, quantum registrado)", proof: /"boundary":\["piso","minimum",true\]/},
  {words: ["acima"], phrase: /\{[a-z_]+\}, acima do custo de capital|fica acima do custo de capital|fica \{giro\} acima/, field: "os dois valores mostrados", rule: "comparação estrita registrada (gt)", proof: /,"gt",\{"slot"|\{"slot":"giro"\},"gt",\{"value":"0"\}/},
  {words: ["mínimo"], phrase: /caixa mínimo de \{caixa\}|contra o mínimo de \{minimo\}/, field: "minimumCash", rule: "o valor mostrado é o campo de caixa mínimo registrado", proof: /minimumCash/},
  {words: ["menor"], phrase: /de menor caixa/, field: "project-weekly-cash readings.sensitivities[*].minimum", rule: "o caso mostrado tem o menor mínimo entre os casos alternativos (every ge)", proof: /"every":\["project-weekly-cash","readings.sensitivities","minimum"\],"op":"ge"/},
  {words: ["alternativo"], phrase: /No caso alternativo/, field: "result.weekly.cases[id].role", rule: "papel registrado alternative", proof: /\.role"\]\},"eq",\{"value":"alternative"\}/},
  {words: ["alternativo", "apresentado"], phrase: /[Pp]lano alternativo(?: apresentado no material)?/, field: "readings.alternative.pathId", rule: "plano alternativo do resultado; o material o apresenta (alternative_not_presented)", proof: /readings\.alternative\.pathId/},
  {words: ["menor"], phrase: /economia menor/, field: "cases[id].result.project.rows[*].incrementalEbitda (economia operacional líquida)", rule: "só os três custos do projeto mudam (changedOnly) e a economia líquida fica dominada período a período pela da referência, em todo o horizonte (dominates lt)", proof: /"changedOnly".*"field":"incrementalEbitda"\}\],"op":"lt"/},
  {words: ["maiores"], phrase: /capex e depreciação maiores/, field: "cases[id].result.project.rows[*].growthCapex e incrementalDepreciation", rule: "só capex e depreciação mudam (changedOnly) e os dois, como a fonte os calcula, dominam a referência por cima (dominates gt)", proof: /"changedOnly".*"field":"growthCapex"\}\],"op":"gt".*"field":"incrementalDepreciation"\}\],"op":"gt"/},
  {words: ["lenta"], phrase: /partida mais lenta/, field: "cases[id].result.ramp[0].operands.operationStartMonth", rule: "só o mês de início muda (changedOnly) e é posterior ao da referência (gt)", proof: /"changedOnly".*operationStartMonth"\]\},"gt"/},
  {words: ["negativo"], phrase: /VPL fica negativo/, field: "comparison.metrics[caseId].netPresentValue", rule: "valor registrado menor que zero (lt 0)", proof: /,"lt",\{"value":"0"\}/},
  {words: ["maior"], phrase: /maior credor/, field: "result.table.rows[*].creditor e principal", rule: "maior principal somado por credor, único (largestGroup)", proof: /"largestGroup"/},
  {words: ["maior"], phrase: /prazo maior de recebimento/, field: "projectionDriver receivableDays", rule: "prazo do cenário maior que o da referência no ano mostrado (atKey gt)", proof: /"atKey".*"op":"gt"/},
  {words: ["concentrada"], phrase: /concentrada \{em:ano\}/, field: "result.table.profile.scheduleByYear[*].principal", rule: "ano de maior vencimento de principal (largest)", proof: /"largest":\["build-company-debt-table","result.table.profile.scheduleByYear"/},
  {words: ["médio"], phrase: /Prazo médio/, field: "result.table.profile.weightedAverageLifeYears", rule: "o valor mostrado é o prazo médio ponderado registrado", proof: /weightedAverageLifeYears/},
  {words: ["mantida"], phrase: /(?:dívida )?mantida(?: a dívida)? como está/, field: "path manter: termos, instrumentos, pré-pagamentos e encargos", rule: "caminho de status quo sem nenhum movimento (pathMoves vazio, mesma variante)", proof: /"pathMoves":\["evaluate-financing-paths","manter"\],"added":\[\],"removed":\[\],"prepaid":\[\],"charges":\[\],"variant":"same"/},
  {words: ["disponível"], phrase: /caixa disponível/, field: "availableForService | availableAfterInterest", rule: "o valor mostrado é o caixa disponível registrado", proof: /availableForService|availableAfterInterest/},
  {words: ["só", "livres", "nova"], phrase: /tem só \{saldo\} livres na exceção para garantias de nova dívida/, field: "result.table.negativePledgeBaskets[holderId].remaining e basket", rule: "saldo restante registrado da exceção de garantias, menor que a exceção (lt)", proof: /negativePledgeBaskets\[holderId=\$h\]\.remaining.*"lt",\{"at":\["build-company-debt-table","result.table.negativePledgeBaskets/},
  {words: ["ocupados"], phrase: /\{ocupado\} ocupados/, field: "result.table.negativePledgeBaskets[holderId].occupied", rule: "o valor mostrado é o ocupado registrado, só pela dívida nomeada (includes only)", proof: /\.occupied".*"only":true/},
  {words: ["só", "recomendado"], phrase: /só o recomendado passa em todos os critérios/, field: "readings.paths[*].eligible e readings.recommendation.pathId", rule: "só o caminho recomendado é elegível (onlyFlagged)", proof: /"onlyFlagged"/},
  {words: ["próprios", "só", "bancária"], phrase: /programas de antecipação dos próprios clientes, com a linha bancária só como reserva/, field: "result.funding.plan.steps, options[id].kind, plan.reserve, bankLine", rule: "dois primeiros passos de tipo anchor_program, a linha bancária é a reserva e nenhum passo bancário", proof: /"value":"anchor_program".*result.funding.plan.reserve.*"count":0/},
  {words: ["sem", "bancária", "nova"], phrase: /sem dívida bancária nova/, field: "readings.options[id].measuredDebtAdded", rule: "dívida medida adicionada zero nos dois programas", proof: /measuredDebtAdded"\]\},"eq",\{"value":"0"\}/},
  {words: ["acumulado"], phrase: /fluxo acumulado do projeto/, field: "comparison.metrics[caseId=base].peakCumulativeCashNeed", rule: "o valor mostrado é o pico do fluxo acumulado registrado", proof: /peakCumulativeCashNeed/},
  {words: ["praticamente", "igual"], phrase: /praticamente igual/, field: "os dois valores mostrados", rule: "redação declarada quando a ordem exata não se mantém no exibido entre dois valores mostrados", proof: "nearly_equal"},
  {words: ["adiamento"], phrase: /registra como adiamento/, field: "cases[id=defer-12].role", rule: "papel registrado deferral", proof: /"value":"deferral"/},
  {words: ["adiamento"], phrase: /adiamento \{projeto\}/, field: "variant do caminho e do status quo", rule: "variante do caminho é a de referência deslocada (planDeferred)", proof: /"planDeferred"/},
  {words: ["adiados", "estendido", "mesma"], phrase: /capex e início de operação adiados e horizonte da análise estendido na mesma medida/, field: "cases[id].result.contributions", rule: "caso é a referência deslocada por inteiro (deferredBy)", proof: /"deferredBy"/},
  {words: ["apresentado"], phrase: /Motivo apresentado pelo presidente do conselho/, field: "fato informado com autor presidente", rule: "fato informado pelo presidente, do dicionário fechado", proof: /"type":"informed","author":"chair"/},
  {words: ["indicativo"], phrase: /Custo indicativo dos programas/, field: "result.funding.options[id].indicative", rule: "condição indicativa registrada nos dois programas", proof: /indicative"\]\},"eq",\{"value":"true"\}/},
  {words: ["indicativas"], phrase: /programas de antecipação indicativas/, field: "result.funding.options[id].indicative", rule: "condição indicativa registrada nos dois programas", proof: /indicative"\]\},"eq",\{"value":"true"\}/},
  {words: ["primeiro", "segundo"], phrase: /no primeiro e CDI mais \{taxa_a\} no segundo/, field: "result.funding.plan.steps[0|1].optionId", rule: "ordem registrada dos passos do plano", proof: /steps\[0\].*steps\[1\]/},
  {words: ["registrada", "livre"], phrase: /Linha de crédito registrada com \{credor\}, com limite livre/, field: "result.table.creditLines[id].unused", rule: "linha da tabela de dívida; limite não usado registrado, maior que zero", proof: /creditLines\[id=\$c\]\.unused.*\{"slot":"livre"\},"gt",\{"value":"0"\}/},
  {words: ["outra"], phrase: /outra variante \{projeto\}/, field: "path.terms[1] contra o status quo", rule: "variante diferente da do status quo (variant other)", proof: /"variant":"other"/},
  {words: ["informado"], phrase: /no cronograma informado/, field: "path.terms[1] contra o status quo", rule: "mesma variante do status quo (variant same)", proof: /"variant":"same"/},
  {words: ["bancário", "novo", "programada"], phrase: /financiamento bancário novo(?: de cerca de \{valor\},)? com amortização programada/, field: "instrument.terms: papel, credor, amortização após o horizonte", rule: "instrumento novo de banco com amortização programada após o horizonte", proof: /bancario_programado/},
  {words: ["alongada"], phrase: /alongada por aditamento/, field: "instrument.replaces, finalPaymentDate, amortization", rule: "aditamento que substitui a dívida nomeada, vence depois e paga menos principal (extendsDebt)", proof: /"extendsDebt"/},
  {words: ["sem"], phrase: /[Ss]em \{projeto\}/, field: "variant.kind do caminho", rule: "variante do caminho de tipo none (sem o projeto)", proof: /variant\.\$[a-z]+\.kind"\]\},"eq",\{"value":"none"\}|"pathMoves":\["evaluate-financing-paths","sem-linha-debenture"\][^}]*"variant":"other".*"value":"none"/},
  {words: ["caro"], phrase: /mais caro/, field: "scenarios[id].inputCostShock.rate", rule: "choque registrado maior que zero", proof: /inputCostShock.rate"\]\},"gt",\{"value":"0"\}/},
  {words: ["adverso"], phrase: /no adverso|o adverso/, field: "measurements[id].scenario", rule: "medição do cenário registrado adverse", proof: /"value":"adverse"/},
  {words: ["efetivo"], phrase: /[Cc]usto efetivo/, field: "readings.recommendation.longInstrument.equivalentSpread", rule: "custo equivalente registrado do instrumento", proof: /equivalentSpread/},
  {words: ["líquida"], phrase: /dívida líquida/, field: "netDebtAtHorizon", rule: "o valor mostrado é a dívida líquida registrada", proof: /netDebtAtHorizon/},
  {words: ["líquido", "conhecidos"], phrase: /ganho líquido(?: dos custos conhecidos)?/, field: "levers[role=rating].netOfKnownCosts", rule: "ganho registrado líquido dos custos conhecidos", proof: /netOfKnownCosts/},
  {words: ["levantados"], phrase: /custos ainda não levantados/, field: "result.actions[actionId].result.operands.costCoverage", rule: "cobertura de custos registrada incompleta", proof: /costCoverage"\]\},"eq",\{"value":"incomplete"\}/},
  {words: ["conhecidos"], phrase: /os ajustes conhecidos somam \{ajustes\}/, field: "result.bridge.knownAdjustmentsBps", rule: "o valor mostrado é a soma registrada dos ajustes conhecidos", proof: /knownAdjustmentsBps/},
  {words: ["sem"], phrase: /\{resto\} ficam sem explicação/, field: "result.bridge.causalAttribution", rule: "a ponte não atribui causa ao restante", proof: /causalAttribution"\]\},"eq",\{"value":"false"\}/},
  {words: ["total"], phrase: /de um total de \{carteira\}/, field: "readings.gross", rule: "carteira bruta registrada", proof: /readings\.gross/},
  {words: ["sem"], phrase: /veda a cessão sem consentimento/, field: "item.contract", rule: "contrato registrado prohibited_without_consent", proof: /prohibited_without_consent/},
  {words: ["sem", "regresso"], phrase: /sem regresso/, field: "result.funding.options[id].recourse", rule: "recurso registrado without_recourse", proof: /without_recourse/},
  {words: ["próprio"], phrase: /o programa próprio dele/, field: "option.anchorItemIds", rule: "programa de tipo anchor_program ligado na fonte só a esse cliente", proof: /anchorItemIds"\],"value":\{"var":"d"\},"only":true/},
  {words: ["fixos", "sem", "apresentada"], phrase: /custos fixos sem evidência apresentada/, field: "readings.assumptions[*].drivers e evidenceStatus", rule: "drivers registrados com evidência not_presented", proof: /"fixedCosts".*"not_presented"/},
  {words: ["sem"], phrase: /sem investimento/, field: "readings.capacity.aboveWithoutInvestment, investmentInPlan", rule: "volume acima da capacidade e investimento fora do plano", proof: /investmentInPlan"\]\},"eq",\{"value":"false"\}/},
  {words: ["revisados"], phrase: /casos revisados/, field: "comparison.metrics[*].caseId", rule: "a opção não está entre os casos com métricas (includes none)", proof: /"value":\{"value":"staged"\},"none":true/},
  {words: ["aprovada"], phrase: /aprovada pelo conselho/, field: "result.headroom.limits[id=politica].kind e status", rule: "limite registrado board_policy em vigor", proof: /"value":"board_policy".*"value":"in_force"/},
  {words: ["menor", "concorrente", "demais", "estratégico"], phrase: /^[^?]*\?$/, field: "nenhum", rule: "pergunta do conselho; não afirma", proof: "question"},
  {words: ["único"], phrase: /um único cliente/, field: "result.funding.portfolio.items[itemId=$d]", rule: "palavras genéricas de um único devedor lido, escritas só com lacuna", proof: "gap"},
  {words: ["sem"], phrase: /sem nome confirmado/, field: "rótulo do credor", rule: "palavras genéricas de um credor cujo rótulo não está no dicionário, escritas só com lacuna", proof: "gap"},
  {words: ["analisado"], phrase: /[Pp]rojeto analisado/, field: "cases[id=base].label", rule: "palavras genéricas do projeto lido, escritas só com lacuna", proof: "gap"},
];
/** Boundaries: every phrase that relates a value to a limit (acima de, abaixo de, até, a partir de, pelo menos, mais de,
 * menos de, no máximo, antes, depois, passa) states whether the limit value itself is in or out ("<", "<=", ">", ">=",
 * or an order of actions with no value), and the template carries the proof of that inclusion: a strict or weak
 * comparison, or the inclusion the source registers for the limit field (boundary). Questions assert nothing. */
/** How a boundary's shown value keeps the admitted set: a limit slot shown on the safe side of the exact value ("not_below":
 * the shown lower end is at least the exact value, for "a partir de"; "not_above": the shown upper end is at most the exact
 * value, for "até", "de até", "abaixo de"), two shown values whose order the display check keeps, a deadline shown by day,
 * a year that is the whole calendar year of the source's end date, or no value at all. */
export type BoardBoundaryDisplay = {slot: string; shown: "not_below" | "not_above"} | "two_shown" | "exact_day" | "year_end" | "no_value";
export const boardBoundaries: readonly {phrase: RegExp; relation: "<" | "<=" | ">" | ">=" | "ordem" | "campo"; field: string; rule: string; proof: RegExp | "no_value"; display: BoardBoundaryDisplay}[] = [
  {phrase: /demanda a partir de \{piso\}/, relation: ">=", field: "issueFloorInsideGates", rule: "piso inclusivo: menor montante, no quantum adotado, que passa em todos os critérios", proof: /"boundary":\["piso","minimum",true\].*demand\.quantum"\]\},"gt"/, display: {slot: "piso", shown: "not_below"}},
  {phrase: /abaixo de \{piso\}/, relation: "<", field: "issueFloorInsideGates", rule: "abaixo do piso inclusivo falha nos critérios", proof: /"boundary":\["piso","minimum",true\].*demand\.quantum"\]\},"gt"/, display: {slot: "piso", shown: "not_above"}},
  {phrase: /de até \{valor\}/, relation: "<=", field: "issueTarget", rule: "alvo de emissão: montante inteiro avaliado, máximo inclusivo", proof: /"boundary":\["valor","maximum",true\]/, display: {slot: "valor", shown: "not_above"}},
  {phrase: /vence \{ate:horizonte\}/, relation: "<=", field: "twelveMonthHorizon", rule: "vencimentos com data até o horizonte, inclusive", proof: /"boundary":\["horizonte","maximum",true\]/, display: {slot: "horizonte", shown: "not_above"}},
  {phrase: /caixa fica abaixo do mínimo/, relation: "<", field: "belowMinimum | shortfallVsPolicyMinimum", rule: "saldo menor que o mínimo (belowMinimum é estrito na fonte) ou falta maior que zero", proof: /belowMinimum"\]\},"eq",\{"value":"true"\}|\{"slot":"falta"\},"gt",\{"value":"0"\}/, display: "no_value"},
  {phrase: /\{[a-z_]+\}[^;.]*abaixo d[aoe]s? (?:política de |covenant de )?\{[a-z_]+\}|abaixo de \{politica\} nos cenários avaliados/, relation: "<", field: "os dois valores mostrados (máximo inclusivo registrado no limite)", rule: "comparação estrita, mais forte que o cumprimento do máximo inclusivo", proof: /,"lt",\{"slot"|"op":"lt","than":\{"slot"/, display: "two_shown"},
  {phrase: /acima do custo de capital|fica \{giro\} acima/, relation: ">", field: "os dois valores mostrados", rule: "comparação estrita (gt)", proof: /,"gt",\{"slot"|\{"slot":"giro"\},"gt",\{"value":"0"\}/, display: "two_shown"},
  {phrase: /custo financeiro de cerca de \{custo\} \{ate:ano\}/, relation: "<=", field: "horizonFinancingCost, readings.horizon.lastPeriodEnd", rule: "custo acumulado até o fim do horizonte, inclusive; o ano é o do fim do horizonte", proof: /lastPeriodEnd"\]\},"eq",\{"value":"\$y-12-31"\}/, display: "year_end"},
  {phrase: /até \{prazo\}/, relation: "<=", field: "prazo da ação da deliberação", rule: "prazo de ação: até a data, inclusive", proof: /"type":"deadline"/, display: "exact_day"},
  {phrase: /antes do vencimento dessa dívida/, relation: "<", field: "prazo e finalPayment", rule: "prazo estritamente anterior ao vencimento (lt)", proof: /\{"slot":"prazo"\},"lt",\{"slot":"vencimento"\}/, display: "two_shown"},
  {phrase: /começando depois dos do plano de referência/, relation: ">", field: "componentes da variante", rule: "cada componente começa estritamente depois (startsLater)", proof: /"startsLater"|"planDeferred"/, display: "no_value"},
  {phrase: /que termina antes do adotado/, relation: "<", field: "amortizationTests[*].years: último pagamento efetivo", rule: "o último pagamento efetivo do perfil lido vem antes do do adotado (lastPaid lt); nenhum superlativo sobre os demais perfis", proof: /"lastPaid".*"lt",\{"lastPaid"/, display: "no_value"},
  {phrase: /passa (?:o covenant|a política) de \{(?:covenant|politica)\}/, relation: ">", field: "measurements[*].ratio e limits[*].maximumRatio", rule: "violação registrada pela fonte (breached) e alavancagem estritamente acima do limite (gt), em exato e no exibido", proof: /breached"\]\},"eq",\{"value":"true"\}.*\{"slot":"alavancagem"\},"gt"/, display: "two_shown"},
  {phrase: /passa o caixa disponível/, relation: ">", field: "scheduledAmortization, availableAfterInterest", rule: "amortização estritamente maior que o caixa disponível (gt)", proof: /\{"slot":"amortizacao"\},"gt",\{"slot":"disponivel"\}/, display: "two_shown"},
  {phrase: /passa a capacidade da fábrica/, relation: ">", field: "readings.capacity.aboveWithoutInvestment", rule: "volume acima da capacidade registrado", proof: /aboveWithoutInvestment"\]\},"eq",\{"value":"true"\}/, display: "no_value"},
  {phrase: /disponível depois dos juros/, relation: "campo", field: "availableAfterInterest", rule: "nome do campo (caixa disponível depois dos juros), não fronteira", proof: /availableAfterInterest/, display: "no_value"},
  {phrase: /antes das cotações|antes do pedido de compra|antes de decidir|até a confirmação do banco/, relation: "ordem", field: "nenhum", rule: "ordem de ações ou condição até um evento, sem valor de fronteira", proof: "no_value", display: "no_value"},
];
/** Words that qualify an object and therefore need a registered phrase and proof wherever they appear. */
export const boardQualifierWatch = [...new Set([...boardQualifiers.flatMap((q) => q.words),
  "longo", "longa", "nova", "novo", "novos", "atual", "atuais", "próprio", "própria", "próprios", "livre", "livres", "adiado", "adiada", "adiados", "alongado", "alongada",
  "programado", "programada", "indicativo", "indicativa", "indicativas", "firme", "firmes", "regresso", "vigente", "vigentes", "único", "única", "maior", "maiores", "menor", "menores",
  "curto", "curta", "sazonal", "sazonais", "estratégico", "estratégica", "preliminar", "publicada", "barato", "caro", "elevado", "elevada", "baixo", "alto", "forte", "fraco", "sólido", "saudável", "confortável", "apertado"])];

export function checkBoardTemplateLibrary(library: Readonly<Record<string, BoardTemplate>> = boardTemplates) {
  const problems: string[] = [];
  // The dictionaries shown as text (informed reasons, debtor names) never name an object of a vocabulary.
  for (const [code, text] of [...Object.entries(boardInformedReasons), ...Object.entries(boardDebtorNames)])
    for (const terms of Object.values(boardVocabularies)) for (const term of Object.keys(terms))
      if (new RegExp(`(?<![\\p{L}])${term}(?![\\p{L}])`, "iu").test(text)) problems.push(`dictionary:${code}:object:${term}`);
  for (const [id, x] of Object.entries(library)) {
    const vars = new Set<string>();
    for (const spec of Object.values(x.slots)) {
      for (const [, path] of spec.from ?? []) for (const m of path.matchAll(/\$([a-z]+)/g)) vars.add(m[1]!);
      if (spec.year) for (const m of spec.year.matchAll(/\$([a-z]+)/g)) vars.add(m[1]!);
      if (spec.type === "deadline" ? !spec.action || library[spec.action]?.use[0] !== "delib.action" : spec.type === "informed" ? !spec.author : !spec.from && !spec.year) problems.push(`${id}:slot`);
      if (spec.year && spec.type !== "date") problems.push(`${id}:year`);
      if ((spec.type === "label" || spec.type === "informed" || spec.type === "debtor" || spec.type === "object") !== Boolean(spec.generic)) problems.push(`${id}:generic`);
      if ((spec.type === "object") !== Boolean(spec.vocabulary && spec.form)) problems.push(`${id}:vocabulary`);
      if (spec.type === "money" && !spec.nature) problems.push(`${id}:nature`);
    }
    for (const c of x.when) {if ("bind" in c) vars.add(c.bind); if (!c.claim) problems.push(`${id}:claim_missing`);}
    const operands: BoardOperand[] = x.when.flatMap((c) => "compare" in c ? [c.compare[0], c.compare[2]] : "every" in c ? [c.than] : "bind" in c ? [c.to] : "includes" in c ? [c.value]
      : "atLeast" in c || "dominates" in c || "atMost" in c || "changedOnly" in c || "deferredBy" in c || "planDeferred" in c || "testsLimit" in c || "samePeriod" in c || "joinedCount" in c || "largestGroup" in c || "coversYear" in c || "boundary" in c || "sameBase" in c || "scenarioDefines" in c || "startsLater" in c || "pathMoves" in c || "extendsDebt" in c || "sameObject" in c || "registeredTerm" in c ? [] : "contributedHas" in c ? [c.value]
      : "atKey" in c ? [c.key] : [c.equals]);
    const paths = x.when.flatMap((c) => "includes" in c ? [c.includes[1]] : "atLeast" in c ? [c.atLeast[1]] : "every" in c ? [c.every[1]]
      : "dominates" in c ? c.dominates.map((d) => "list" in d ? d.list[1] : "contributed" in d ? d.contributed[1] : "projectionRows" in d ? d.projectionRows[1] : d.projectionDriver[1])
      : "contributedHas" in c ? [c.contributedHas[1]] : "atMost" in c ? [c.atMost[1]] : "changedOnly" in c ? [c.changedOnly[1], c.changedOnly[2]] : "deferredBy" in c ? [c.deferredBy[1], c.deferredBy[2]] : "planDeferred" in c ? [c.planDeferred[1], c.planDeferred[2]] : "testsLimit" in c ? ["result.headroom.measurements"] : "samePeriod" in c ? [] : "joinedCount" in c ? [c.joinedCount[1], c.joinedCount[3]] : "largestGroup" in c ? [c.largestGroup[1]] : "sameBase" in c ? [c.sameBase[1], c.sameBase[2]] : "coversYear" in c || "boundary" in c ? []
      : "atKey" in c ? c.atKey.map((d) => "list" in d ? d.list[1] : "contributed" in d ? d.contributed[1] : "projectionRows" in d ? d.projectionRows[1] : d.projectionDriver[1])
      : "startsLater" in c ? c.startsLater.map((d) => "list" in d ? d.list[1] : "contributed" in d ? d.contributed[1] : "projectionRows" in d ? d.projectionRows[1] : d.projectionDriver[1]) : []);
    for (const path of paths) for (const m of path.matchAll(/\$([a-z]+)/g)) if (!vars.has(m[1]!)) problems.push(`${id}:path:${m[1]}`);
    for (const o of operands) {
      if ("slot" in o && !Object.hasOwn(x.slots, o.slot)) problems.push(`${id}:operand:${o.slot}`);
      if ("var" in o && !vars.has(o.var)) problems.push(`${id}:var:${o.var}`);
      if ("at" in o) for (const m of o.at[1].matchAll(/\$([a-z]+)/g)) if (!vars.has(m[1]!)) problems.push(`${id}:at:${m[1]}`);
    }
    for (const m of x.text.matchAll(/\{(?:[a-z]+:)?([a-z_]+)\}/g)) if (!m[0].startsWith("{count:") && !Object.hasOwn(x.slots, m[1]!)) problems.push(`${id}:text:${m[1]}`);
    // A declared "praticamente igual" wording: the same slots, no order asserted.
    if (x.nearlyEqual !== undefined) {
      const slotsOf = (text: string) => [...text.matchAll(/\{(?:[a-z]+:)?([a-z_]+)\}/g)].map((m) => m[1]).sort().join(",");
      if (slotsOf(x.nearlyEqual) !== slotsOf(x.text) || !/praticamente igual/.test(x.nearlyEqual) || /(?<![\p{L}])(acima|abaixo|supera|superior|inferior)(?![\p{L}])/u.test(x.nearlyEqual)) problems.push(`${id}:nearly_equal`);
    }
    // Compliance: every limit a template tests is named with its definition token (omitted at render when registered).
    for (const w of x.when) if ("testsLimit" in w && !new RegExp(`\\{definition:${w.testsLimit[2]}:`).test(x.text)) problems.push(`${id}:definition_token:${w.testsLimit[2]}`);
    // Species tokens: {species:form:selector}, with a form every species and the generic words declare.
    for (const m of x.text.matchAll(/\{species:([a-z_]+):([^}]+)\}/g)) {
      const form = m[1] as BoardObjectForm;
      if (!boardObjectGenerics.species[form] || Object.values(boardVocabularies.species).some((v) => !v[form])) problems.push(`${id}:species_form:${form}`);
      if (!/^(long|existing|new@[$a-z0-9-]+)$/.test(m[2]!)) problems.push(`${id}:species_selector:${m[2]}`);
    }
    // A text that names a cause carries the condition of that cause, on its driver.
    for (const c of boardScenarioDefinitions) if (c.phrase.test(x.text) && !x.when.some((w) => w.claim === `cenário: ${c.scenario}`)) problems.push(`${id}:scenario:${c.scenario}`);
    // No template asserts a cause: verbs that attribute an effect to a driver are refused in the fixed text.
    if (/(?<![\p{L}])(?:leva|levam|reduzem|reduz o|cai para|deixa|deixam|pesam|explica|explicam|por causa|devido)(?![\p{L}])/iu.test(x.text)) problems.push(`${id}:causal_verb`);
    // No fixed text names an object of a vocabulary unless a condition finds that term registered in a source.
    for (const [vocabulary, terms] of Object.entries(boardVocabularies)) for (const term of Object.keys(terms))
      if (new RegExp(`(?<![\\p{L}])${term}(?![\\p{L}])`, "iu").test(x.text) && !x.when.some((w) => "registeredTerm" in w && w.vocabulary === vocabulary && w.term === term))
        problems.push(`${id}:object:${term}`);
    // No fixed text names a creditor or a bank: names enter only through label slots.
    for (const name of boardNameDictionary) if (new RegExp(`(?<![\\p{L}])${name}(?![\\p{L}])`, "u").test(x.text) && !boardNamesAllowedInText.includes(name)) problems.push(`${id}:names:${name}`);
    if (x.of && library[x.of]?.use[0] !== "delib.title") problems.push(`${id}:of`);
    if (["delib.subject", "delib.recommendation", "delib.action"].some((u) => x.use.includes(u as BoardTextUse)) && !x.of) problems.push(`${id}:of_missing`);
    if (x.use.includes("answer") !== Boolean(x.answers) || (x.answers && library[x.answers]?.use[0] !== "question")) problems.push(`${id}:answers`);
  }
  // Qualifiers: every watched word of the fixed text sits in a registered phrase whose proof the template carries.
  for (const [id, x] of Object.entries(library)) {
    const facts = JSON.stringify({slots: x.slots, when: x.when});
    const texts: [string, "text" | "nearly_equal" | "gap"][] = [[x.text, "text"], ...(x.nearlyEqual ? [[x.nearlyEqual, "nearly_equal"] as [string, "nearly_equal"]] : []),
      ...Object.values(x.slots).flatMap((spec) => spec.generic ? [[spec.generic, "gap"] as [string, "gap"]] : [])];
    for (const [raw, kind] of texts) {
      // Words are read with every token masked; phrases are matched on the text with its tokens.
      const text = raw, masked = raw.replace(/\{[^}]*\}/g, (t) => "_".repeat(t.length));
      for (const m of masked.matchAll(/\p{L}+/gu)) {
        const word = m[0].toLowerCase();
        if (!boardQualifierWatch.includes(word)) continue;
        const proven = boardQualifiers.some((q) => q.words.includes(word) && [...text.matchAll(new RegExp(q.phrase.source, `${q.phrase.flags.replace("g", "")}g`))]
          .some((p) => p.index! <= m.index! && m.index! < p.index! + p[0].length)
          && (q.proof === "question" ? x.use.includes("question") && kind === "text" : q.proof === "nearly_equal" ? kind === "nearly_equal" : q.proof === "gap" ? kind === "gap" : q.proof.test(facts)));
        if (!proven) problems.push(`${id}:qualifier_unproved:${word}`);
      }
    }
    // Temporal coherence: every slot that reads a period shares the period of the sentence. A value read from a
    // measurement ($m) needs the measurement's date shown in the sentence, or a condition tying that date to the shown
    // year or date; a value read by a year variable needs that year shown. A declared difference shows both periods.
    {
      const facts = JSON.stringify(x.when);
      const shownYears = new Set(Object.values(x.slots).flatMap((spec) => spec.year ? [spec.year] : []));
      const shownMeasurementDates = new Set(Object.values(x.slots).flatMap((spec) => (spec.from ?? []).flatMap(([, path]) => {const m = /measurements\[id=(\$[a-z]+)\]\.date$/.exec(path); return m ? [m[1]!] : [];})));
      for (const [slot, spec] of Object.entries(x.slots)) for (const [, path] of spec.from ?? []) {
        const m = /measurements\[id=(\$[a-z]+)\]\.(?!date$)/.exec(path);
        if (m) {
          const v = m[1]!.replace("$", "\\$");
          const tied = new RegExp(`\\{"slot":"[a-z_]+"\\},"eq",\\{"at":\\["measure-covenant-headroom","result\\.headroom\\.measurements\\[id=${v}\\]\\.date"\\](?:,"year":true)?\\}|measurements\\[id=${v}\\]\\.date"\\]\\},"eq",\\{"slot":"[a-z_]+"\\}`).test(facts);
          if (!shownMeasurementDates.has(m[1]!) && !tied) problems.push(`${id}:period:${slot}:${m[1]}`);
        }
        for (const y of path.match(/\$y\b/g) ?? []) if (!shownYears.has(y)) problems.push(`${id}:period:${slot}:${y}`);
      }
    }
    // Every template declares its theme.
    if (boardTemplateTheme(id) === null) problems.push(`${id}:theme`);
    // Boundaries shown on a limit slot: the phrase holds that slot, and the template proves the field's registered inclusion.
    for (const b of boardBoundaries) if (typeof b.display === "object" && b.phrase.test(x.text)) {
      const slot = (b.display as {slot: string}).slot;
      if (!new RegExp(`\\{(?:ate:)?${slot}\\}`).test(b.phrase.exec(x.text)![0])) problems.push(`${id}:boundary_display_slot:${slot}`);
    }
    // Boundaries: every relation to a limit sits in a registered phrase whose inclusion the template proves.
    if (!x.use.includes("question")) for (const raw of [x.text, x.nearlyEqual ?? ""]) {
      const masked = raw.replace(/\{(?!ate:|desde:)[^}]*\}/g, (t) => "_".repeat(t.length));
      for (const m of masked.matchAll(/(?<![\p{L}])(?:acima d|abaixo d|até|a partir d|pelo menos|mais de|menos de|mais que|menos que|no máximo|no mínimo|antes d|depois d|passa [oa] )|\{(?:ate|desde):[a-z_]+\}/giu)) {
        const proven = boardBoundaries.some((b) => [...raw.matchAll(new RegExp(b.phrase.source, "g"))].some((p) => p.index! <= m.index! && m.index! < p.index! + p[0].length)
          && (b.proof === "no_value" ? ![...raw.matchAll(b.phrase.global ? b.phrase : new RegExp(b.phrase.source, "g"))].some((p) => /\{/.test(p[0])) : b.proof.test(JSON.stringify({slots: x.slots, when: x.when}))));
        if (!proven) problems.push(`${id}:boundary_unproved:${m[0].trim()}`);
      }
    }
    // "De curto prazo" for bank credit: the token names a path whose moves condition counts unscheduled bank credit.
    for (const m of x.text.matchAll(/\{bankcredit:([^}]+)\}/g))
      if (!x.when.some((c) => "pathMoves" in c && c.pathMoves[1] === m[1] && c.added.includes(bankUnscheduled))) problems.push(`${id}:bankcredit_unproved:${m[1]}`);
    // Species forms: "atual" only of the existing instrument, "nova"/"novo" only of a path's new one.
    for (const m of x.text.matchAll(/\{species:([a-z_]+):([^}]+)\}/g)) {
      const forms = [...Object.values(boardVocabularies.species).map((v) => v[m[1] as BoardObjectForm] ?? ""), boardObjectGenerics.species[m[1] as BoardObjectForm] ?? ""];
      if (forms.some((f) => /(?<![\p{L}])atua(?:l|is)(?![\p{L}])/u.test(f)) && m[2] !== "existing") problems.push(`${id}:species_qualifier:${m[1]}:${m[2]}`);
      if (forms.some((f) => /(?<![\p{L}])nov[oa]s?(?![\p{L}])/u.test(f)) && !m[2]!.startsWith("new@")) problems.push(`${id}:species_qualifier:${m[1]}:${m[2]}`);
    }
  }
  return problems;
}

// The other dictionaries of the library are frozen as well.
for (const x of [boardInformedReasons, boardDebtorNames, boardVocabularies, boardVocabularyLabels, boardObjectGenerics, boardDeferralRules, boardScenarioDefinitions, boardScenariosNotNamed,
  boardNameDictionary, boardNamesAllowedInText, boardQualifiers, boardBoundaries, boardQualifierWatch, boardThemes, boardInputIgnored, boardTextUses, boardSlotTypes, boardInformedAuthors, themeByTemplate, themeByFamily]) boardDeepFreeze(x);
