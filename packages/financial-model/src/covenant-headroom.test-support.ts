import type {AdoptedCovenantHeadroomInput} from "./adopted-covenant-headroom";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";

/** Aurora Alimentos, reading in September 2026 (ficha C12, synthetic). BRL millions; figures at each date
 * are the C32 quarterly plan 7 as the independent oracle computes them. */
export function auroraCovenantBasis(options: {policyDefinition?: string | null; policyOnManagerial?: boolean} = {}) {
  const f = analysisTestBasis(`covenant.${id(60)}.`, "2026-09-15", "2027-12-31");
  const c = (p: string, unit: string, value: Parameters<typeof f.contribute>[2], scenario = "base") => f.contribute(p, unit, value, scenario);
  const num = (p: string, unit: string, value: string, scenario = "base") => c(p, unit, {type: "number", value}, scenario);
  const text = (p: string, value: string, unit = "text") => c(p, unit, {type: "text", value});
  const limit = (key: string, kind: string, label: string, max: string, source: string, definition: string | null, status = "in_force", testDates = ["2026-12-31", "2027-12-31"]) => ({id: key,
    kind: text(`limit.${key}.kind`, kind, "convention"), status: text(`limit.${key}.status`, status, "convention"),
    testDates: c(`limit.${key}.testDates`, "date", {type: "list", value: testDates}),
    label: text(`limit.${key}.label`, label), maximumRatio: num(`limit.${key}.maximumRatio`, "ratio", max),
    source: text(`limit.${key}.source`, source),
    definition: definition === null ? {decisionId: null, definitionVersionId: id(3), definitionKind: "managerial" as const, missingReason: "A ata não diz qual EBITDA a política usa"}
      : text(`limit.${key}.definition`, definition)});
  const measurement = (key: string, scenario: string, date: string, debt: string, cash: string, reported: string, o: {role?: "test" | "contrast"; limitIds?: string[]; unrealized?: string; lease?: boolean} = {}) => {
    const p = `measurement.${key}.`;
    return {id: key, label: key, role: o.role ?? "test", limitIds: o.limitIds ?? (options.policyOnManagerial ? ["aditamento"] : ["aditamento", "politica"]), scenario,
      date: c(p + "date", "date", {type: "date", value: date}, scenario), debt: num(p + "debt", "currency", debt, scenario), cash: num(p + "cash", "currency", cash, scenario),
      reportedEbitda: num(p + "reportedEbitda", "currency", reported, scenario),
      adjustments: o.lease === false ? [] : [{id: "arrendamentos", label: c(p + "adjustment.arrendamentos.label", "text", {type: "text", value: "Pagamentos de arrendamento"}, scenario),
        amount: num(p + "adjustment.arrendamentos.amount", "currency", "-3", scenario)}],
      unrealizedEbitda: o.unrealized ? num(p + "unrealizedEbitda", "currency", o.unrealized, scenario) : null};
  };
  const input = {...f.context, analysisId: id(60), scenario: "base", readingDate: "2026-09-15",
    limits: [
      limit("aditamento", "contractual", "Dívida líquida / EBITDA até 3,0x (1º aditamento)", "3", "1º aditamento cl. 3", "EBITDA da CVM 156 dos últimos doze meses menos pagamentos de arrendamento; dívida bruta menos caixa"),
      limit("politica", "board_policy", "Política do conselho: até 2,5x", "2.5", "Ata do conselho de março", options.policyDefinition === undefined ? null : options.policyDefinition),
      limit("original", "contractual", "Escritura original sem o aditamento: 2,75x (superada)", "2.75", "Escritura cl. 7.1", "Mesma definição da escritura", "superseded", []),
    ],
    measurements: [
      measurement("dez26-base", "base", "2026-12-31", "128.66666667", "15.45720186", "54.5", {unrealized: "26"}),
      measurement("dez26-adverso", "adverse", "2026-12-31", "128.66666667", "14.07120186", "52.4"),
      measurement("dez26-safra-30", "safra_30", "2026-12-31", "128.66666667", "10.45720186", "54.5"),
      measurement("dez26-sem-safra", "sem_safra", "2026-12-31", "128.66666667", "40.45720186", "54.5", {role: "contrast", limitIds: []}),
      measurement("dez27-base", "base", "2027-12-31", "120", "20.67860248", "56.6"),
      measurement("dez27-adverso", "adverse", "2027-12-31", "120", "13.05649438", "48.11"),
      measurement("junho-gerencial", "gerencial", "2026-06-30", "130", "35", "55", {role: "contrast", limitIds: [], lease: false}),
      measurement("dez26-escritura-original", "original", "2026-12-31", "128.66666667", "15.45720186", "54.5", {role: "contrast", limitIds: ["original"]}),
      // Turn 2: the board measures its policy on managerial EBITDA (CVM 156 plus about 1 of management adjustments, leases not deducted).
      ...options.policyOnManagerial ? [measurement("dez26-politica-gerencial", "gerencial_dez", "2026-12-31", "128.66666667", "15.45720186", "55.5", {limitIds: ["politica"], lease: false})] : [],
    ],
    effects: [{id: "safra", label: "Safra na data de apuração", measurementId: "dez26-base", withoutEffectMeasurementId: "dez26-sem-safra"}],
    consequence: {acceleration: text("consequence.acceleration", "non_automatic", "convention"),
      process: text("consequence.process", "Assembleia de debenturistas decide o vencimento antecipado (escritura cl. 7.2)"),
      crossDefault: text("consequence.crossDefault", "Declarado o vencimento da debênture, a CCB do Bradesco pode ser vencida: limiar de R$ 5 milhões (CCB cl. 9)")},
  } as unknown as AdoptedCovenantHeadroomInput;
  const seal = () => ({...input, envelope: f.seal()});
  return {...f, input, seal};
}
