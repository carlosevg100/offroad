import Decimal from "decimal.js";
import {describe, expect, it} from "vitest";
import {boardFreeTextIssue, boardNumberTokens, formatBoardReading, renderBoardRef, verifyBoardRendered, checkBoardText, orderBoardDeliberations, orderBoardPages, readBoardSourcePath, renderBoardTemplate,
  type BoardDeliberation, type BoardFigureDisplay, type BoardPage, type BoardSourceReading} from "./board-capital-discussion";
import type {BoardFieldSpec} from "./board-capital-discussion-sources";
import {boardTemplates, checkBoardTemplateLibrary, parseBoardTextRef, type BoardCondition} from "./board-capital-discussion-templates";

const deliberation = (id: string, dates: string[]): BoardDeliberation => ({id, title: id, subject: `decidir ${id}`, recommendation: null, topicId: null, authority: "board", authorityBasis: null,
  deadlines: dates.map((date, i) => ({id: `d${i}`, date, action: "agir"}))});
const page = (id: string, role: BoardPage["role"], topicId: string | null = null): BoardPage => ({id, role, topicId, title: id, lines: [], recommendation: null, options: []});

describe("board discussion core", () => {
  it("reads a reviewed result by key, position and unique selector, and leaves anything else unresolved", () => {
    const packet = {a: {rows: [{id: "x", v: "1.5"}, {id: "y", v: "2"}], byYear: {"2027": "3"}}, list: [{k: 1}, {k: 1}]};
    expect(readBoardSourcePath(packet, "a.rows[id=y].v")).toBe("2");
    expect(readBoardSourcePath(packet, "a.rows[0].v")).toBe("1.5");
    expect(readBoardSourcePath(packet, "a.byYear.2027")).toBe("3");
    expect(readBoardSourcePath(packet, "a.rows[id=z].v")).toBeUndefined();
    expect(readBoardSourcePath(packet, "list[k=1]")).toBeUndefined();
    expect(readBoardSourcePath(packet, "a.missing")).toBeUndefined();
    expect(() => readBoardSourcePath(packet, "a.rows[id]")).toThrow("board_capital_path_invalid");
  });
  it("formats a reading only in the unit, scale and periodicity of its registered field", () => {
    const spec = (kind: BoardFieldSpec["kind"], scale: BoardFieldSpec["scale"] = "native", period: BoardFieldSpec["period"] = "none", formats: BoardFieldSpec["formats"] = []): BoardFieldSpec => ({kind, scale, period, formats});
    expect(formatBoardReading("0.15803214919295541016", spec("rate", "ratio", "annual"), "0", "16")).toMatchObject({display: "16% ao ano", matches: true});
    expect(formatBoardReading("0.282", spec("rate", "ratio"), "0", "28")).toMatchObject({display: "28%", matches: true});
    expect(formatBoardReading("732202.68", spec("money", "reais"), "1", "0.7")).toMatchObject({display: "R$ 0,7 milhão", matches: true});
    expect(formatBoardReading("130", spec("money", "millions"), "0", "130")).toMatchObject({display: "R$ 130 milhões", matches: true});
    expect(formatBoardReading("130", spec("money", "millions"), "0", "130000")).toMatchObject({matches: false});
    expect(formatBoardReading("-165000", spec("money", "reais", "annual"), "2", "-0.17")).toMatchObject({display: "R$ -0,17 milhão por ano", matches: true});
    expect(formatBoardReading("1.4511", spec("years"), "1", "1.5")).toMatchObject({display: "1,5 anos", matches: true});
    expect(formatBoardReading(4, spec("months"), "0", "4")).toMatchObject({display: "4 meses", matches: true});
    expect(formatBoardReading("2.198", spec("multiple"), "1", "2.2")).toMatchObject({display: "2,2x", matches: true});
    expect(formatBoardReading("2026-12-21", spec("date", "native", "none", ["day_month"]), "day_month", "2026-12-21")).toMatchObject({display: "21/dez"});
    expect(formatBoardReading("2026-12-21", spec("date", "native", "none", ["day_month"]), "year", "2026-12-21")).toBeNull();
    expect(formatBoardReading(2027, spec("calendar", "native", "none", ["year"]), "year", "2027")).toMatchObject({display: "2027"});
    expect(formatBoardReading("2027", spec("calendar", "native", "none", ["year"]), "year", "2027")).toBeNull();
    expect(formatBoardReading("130", spec("money", "millions"), "3", "130")).toBeNull();
    expect(formatBoardReading("130", spec("label"), "-", null)).toBeNull();
    expect(formatBoardReading(true, spec("flag"), "-", null)).toMatchObject({display: "sim"});
  });
  it("free text passes only the whitelist and the closed lexicon; dates carry their preposition", () => {
    expect(boardFreeTextIssue("Vencimentos, pré-paga o Bradesco; (rating)? \"sim\".")).toBeNull();
    for (const [t, why] of [["dívida de 130", "character:1"], ["prazo de \uff11,\uff16", "character:1"], ["dívida de \u0661\u0663\u0660", "character:"], ["taxa de \u066a", "character:"],
      ["R$", "character:$"], ["US$", "character:$"], ["dívida em dólares", "word:dólares"], ["valor em CAD", "word:cad"], ["dívida em ienes", "word:ienes"], ["cem centavos", "word:cem"],
      ["milhares de reais", "word:milhares"], ["duas vezes por semana", "word:duas"], ["por semestre", "word:semestre"], ["(sete anos)", "word:sete"], ["em dezembro", "word:dezembro"],
      ["por cento", "word:cento"], ["três pontos percentuais", "word:três"], ["taxa de x", "word:x"], ["- dívida", "character:-"], ["a.a.", "word:abbreviation"]] as const)
      expect(boardFreeTextIssue(t), t).toContain(why);
    const context = {figures: new Map<string, BoardFigureDisplay>([["x", {display: "1,5 anos", unit: "years"}], ["y", {display: "2027", unit: "calendar"}], ["p", {pending: true}]]),
      deliberations: [deliberation("a", ["2026-10-02"]), deliberation("b", [])], nextMeetingDate: null};
    expect(renderBoardTemplate("{count:deliberations} decisões, {count:dated} com prazo; {x} e {p} {em:y}; até {deadline:a.d0}", context))
      .toMatchObject({display: "duas decisões, uma com prazo; 1,5 anos e [pendente] em 2027; até 2/out", figureIds: ["x", "y"], pendingFigureIds: ["p"], deadlineIds: ["a.d0"]});
    expect(() => renderBoardTemplate("R$ 77 milhões", context)).toThrow("board_capital_number_without_origin");
    expect(() => renderBoardTemplate("em {y}", context)).toThrow("board_capital_date_without_preposition:y");
    expect(() => renderBoardTemplate("{em:x}", context)).toThrow("board_capital_preposition_on_value:x");
    expect(() => renderBoardTemplate("{z}", context)).toThrow("board_capital_unknown_token:z");
    expect(checkBoardText("Presidente do conselho")).toBe("Presidente do conselho");
    expect(() => checkBoardText("Linha com retorno de 16,1%")).toThrow("board_capital_number_without_origin");
  });
  it("orders deliberations by their earliest deadline, undated last, ties in adopted order", () => {
    const ordered = orderBoardDeliberations([deliberation("policy", []), deliberation("route", ["2026-11-15", "2026-10-31"]), deliberation("line", ["2026-10-02"]), deliberation("crop", ["2026-10-16"])]);
    expect(ordered.map((d) => d.id)).toEqual(["line", "crop", "route", "policy"]);
  });
  it("puts an unseen topic before the recommendation and a seen one in the appendix", () => {
    // The theme is the page's templates' (topic.project_* is the packaging line), whatever topicId the page carries.
    const titled = (id: string, role: BoardPage["role"], title: string, topicId: string | null) => ({...page(id, role, topicId), title});
    const pages = [titled("rec", "recommendation", "recommendation.debenture", "vencimentos"), titled("dec", "decisions", "page.decisions", "geral"),
      titled("line", "topic", "topic.project_return", "safra"), titled("debt", "situation", "situation.debt_total", "geral")];
    expect(orderBoardPages(pages, [{id: "linha-embalagem", label: "linha", seen: false}]).main.map((p) => p.id)).toEqual(["dec", "debt", "line", "rec"]);
    expect(orderBoardPages(pages, [{id: "linha-embalagem", label: "linha", seen: null}]).main.map((p) => p.id)).toEqual(["dec", "debt", "line", "rec"]);
    // A seen theme other than the page's derived one never sends it to the appendix.
    expect(orderBoardPages(pages, [{id: "safra", label: "safra", seen: true}]).appendix.map((p) => p.id)).toEqual([]);
    const seen = orderBoardPages(pages, [{id: "linha-embalagem", label: "linha", seen: true}]);
    expect([seen.main.map((p) => p.id), seen.appendix.map((p) => p.id)]).toEqual([["dec", "debt", "rec"], ["line"]]);
  });
  it("tokenizes every number of a final text once: sign, separators, dates and months of a year", () => {
    expect(boardNumberTokens("R$ -9,5 mi em 21/dez; 130,3 e 1.303; dez/26; 2027; 16%; 2,2x; +3; \u22121").map((t) => t.text))
      .toEqual(["-9,5", "21/dez", "130,3", "1.303", "dez/26", "2027", "16", "2,2", "+3", "\u22121"]);
  });
  it("verifies the final text: markers are the formatter's text, free text passes the whitelist, no preposition before a date or a value", () => {
    const figures = new Map<string, BoardFigureDisplay>([["d", {display: "R$ 130 milhões", unit: "money"}], ["b", {display: "R$ 3 milhões", unit: "money"}],
      ["r", {display: "1,2% ao ano", unit: "rate"}], ["w", {display: "1,5 anos", unit: "years"}], ["y", {display: "2027", unit: "calendar"}], ["l", {display: "Banco do Brasil", unit: "label"}]]);
    const context = {figures, deliberations: [], nextMeetingDate: null};
    const check = (t: string) => verifyBoardRendered("f", renderBoardTemplate(t, context), figures);
    expect(check("A dívida é {d}, concentrada {em:y}, a CDI mais {r}; prazo de {w}; {l}")).toBe(4);
    // Two markers side by side stay two whole numbers; they never form a new one.
    expect(check("{d},{b}")).toBe(2);
    for (const [t, why] of [["{d}{b}", "glued_to_marker"], ["A dívida equivale a {em:y}", "preposition_before_marker"],  ["A dívida é de {em:y} CAD.", "number_without_origin"], ["Retorno de {r} ao mês", "number_without_origin"]] as const)
      expect(() => check(t), t).toThrow(why);
    // A source label is shown only as an entry of the closed name dictionary; any other string is refused on the final text.
    for (const bad of ["Debenturistas; dívida total de R$ 999 milhões", "Bradesco \uff11\uff16", "retorno de menos dezasseis por minuto", "Bradesco Deve Dezassete Cêntimos", "Banco Mais Caixa"]) {
      const f = new Map<string, BoardFigureDisplay>([["l", {display: bad, unit: "label"}]]);
      expect(() => verifyBoardRendered("f", {display: bad, spans: [{start: 0, end: bad.length, kind: "text_figure", id: "l", unit: "label"}]}, f), bad).toThrow("label_not_in_dictionary");
    }
    expect(() => verifyBoardRendered("f", {display: "R$ 131 milhões", spans: [{start: 0, end: 14, kind: "figure", id: "d", unit: "money"}]}, figures)).toThrow("marker_text");
    expect(() => verifyBoardRendered("f", {display: "Dívida \uff11\uff13\uff10 e R$ 130 milhões", spans: [{start: 13, end: 27, kind: "figure", id: "d", unit: "money"}]}, figures)).toThrow("without_marker");
  });
  it("shows money only in reais", () => {
    expect(() => formatBoardReading("130", {kind: "money", scale: "millions", period: "none", formats: []}, "0", "130", "USD")).toThrow("board_capital_currency_not_supported:USD");
  });
  it("the closed library: every text passes the whitelist and the lexicon, every slot is typed and used once, and references are checked by name", () => {
    expect(checkBoardTemplateLibrary()).toEqual([]);
    for (const [id, t] of Object.entries(boardTemplates)) {
      expect(boardFreeTextIssue(t.text.replace(/\{[^}]*\}/g, " ")), id).toBeNull();
      const used = [...t.text.matchAll(/\{(?:(?:em|ate|desde|para|fim|de|a):)?([a-z_]+)\}/g)].map((m) => m[1]!);
      expect(new Set(used), id).toEqual(new Set(Object.keys(t.slots)));
      for (const m of t.text.matchAll(/\{(em|ate|desde|para|fim|de|a):([a-z_]+)\}/g)) expect(t.slots[m[2]!]!.type, id).toBe("date");
    }
    expect(parseBoardTextRef("situation.debt_total|total=divida-total|ano=year-2027").bindings).toEqual({total: "divida-total", ano: "year-2027"});
    expect(() => parseBoardTextRef("A dívida é de R$ 130 milhões")).toThrow("board_capital_text_ref_invalid");
    expect(() => parseBoardTextRef("situation.made_up")).toThrow("board_capital_template_unknown");
    expect(() => parseBoardTextRef("situation.debt_total|total=divida-total")).toThrow("board_capital_slot_unbound");
    expect(() => parseBoardTextRef("situation.debt_total|total=a|ano=b|extra=c")).toThrow("board_capital_slot_invalid");
    expect(() => parseBoardTextRef("situation.debt_total|total=a|total=b|ano=c")).toThrow("board_capital_slot_invalid");
    const DT = "build-company-debt-table", IP = "analyze-investment-project";
    const origin = (methodId: string, path: string, value: string, sourceId = methodId === DT ? "t" : "l") => ({sourceId, methodId, path, value});
    const figures = new Map<string, BoardFigureDisplay>([
      ["d", {display: "R$ 130 milhões", unit: "money", origin: origin(DT, "result.table.reconciliation.principal", "130")}],
      ["b", {display: "R$ 3 milhões", unit: "money", origin: origin(DT, "result.table.negativePledgeBaskets[holderId=debenture-1].remaining", "3")}],
      ["y", {display: "2027", unit: "calendar", origin: origin(DT, "result.table.profile.scheduleByYear[year=2027].year", "2027")}],
      ["y26", {display: "2026", unit: "calendar", origin: origin(DT, "result.table.profile.scheduleByYear[year=2026].year", "2026")}],
      ["r", {display: "16% ao ano", unit: "rate", origin: origin(IP, "comparison.metrics[caseId=base].annualIrr", "0.16")}],
      ["n", {display: "R$ 0,7 milhão", unit: "money", origin: origin(IP, "comparison.metrics[caseId=base].netPresentValue", "700000")}],
      ["e", {display: "R$ -6,4 milhões", unit: "money", origin: origin(IP, "comparison.metrics[caseId=economy-4].netPresentValue", "-6400000")}],
      ["c", {display: "R$ -2,1 milhões", unit: "money", origin: origin(IP, "comparison.metrics[caseId=capex-120].netPresentValue", "-2100000")}],
      ["s", {display: "R$ -1,0 milhão", unit: "money", origin: origin(IP, "comparison.metrics[caseId=slower-start].netPresentValue", "-1000000")}],
      ["ep", {display: "R$ 6,4 milhões", unit: "money", origin: origin(IP, "comparison.metrics[caseId=economy-4].netPresentValue", "6400000")}],
      ["p", {pending: true, methodId: IP, path: "comparison.metrics[caseId=staged].netPresentValue"}],
      ["pw", {pending: true, methodId: IP, path: "comparison.metrics[caseId=base].discountRate"}],
      ["pl", {display: "Linha de embalagem, cronograma original", unit: "label", origin: origin(IP, "cases[id=base].label", "Linha de embalagem, cronograma original")}]]);
    const source = (id: string, methodId: string, packet: unknown) => ({id, methodId, methodVersion: "v", executorVersion: null, packetSchemaVersion: "v", packetFingerprint: "f", status: "s", gaps: [], packet}) as BoardSourceReading;
    const sources = [source("t", DT, {result: {table: {profile: {scheduleByYear: [{year: 2026, principal: "18"}, {year: 2027, principal: "77"}]}}}}), source("l", IP, {cases: (() => {
      const periods = ["2026-12-31", "2027-12-31", "2028-12-31"];
      const make = (id: string, o: {avoided?: string[]; capex?: string[]; dep?: string[]; active?: string[]; load?: string[]; start?: string}) => {
        const avoided = o.avoided ?? ["0", "30", "30"], capex = o.capex ?? ["10", "8", "0"], dep = o.dep ?? ["1.8", "1.8", "1.8"], active = o.active ?? ["0", "0.6", "1"], load = o.load ?? ["0", "0.5", "1"];
        const costs = o.avoided ? ["0", "13", "13"] : ["0", "19.5", "19.5"], fixed = o.avoided ? ["0", "3", "3"] : ["0", "4.5", "4.5"];
        const operands = periods.map((periodId, k) => ({annualAvoidedOperatingCost: avoided[k], annualVariableOperatingCost: costs[k], annualFixedOperatingCost: fixed[k],
          growthCapexPaid: capex[k], annualDepreciation: dep[k], activeYearFraction: active[k], loadYearFraction: load[k]}));
        // The case's adopted inputs (its whole input object), with ids that differ per case and are ignored.
        const contributions = ([["project.annualAvoidedOperatingCost", avoided], ["project.annualVariableOperatingCost", costs], ["project.annualFixedOperatingCost", fixed],
          ["project.growthCapexPaid", capex], ["project.annualDepreciation", dep], ["project.ramp.operationStartMonth", o.start ?? "2027-05-01"], ["valuation.discountRate", "0.15"]] as const)
          .map(([f, v], k) => ({decisionId: `${id}-${k}`, slotKey: `${id}-${k}`, fieldPath: `investment.ac400000-0000-4000-9000-000000001004.${f}`, dimensions: {scenario: id, unit: "x"},
            value: {type: Array.isArray(v) ? "list" : "text", value: v}}));
        return {id, role: id === "base" ? "base" : "sensitivity", result: {inheritedScenario: id === "base" ? null : "base", contributions,
          project: {operands: {periods: operands}, rows: periods.map((periodId, k) => ({periodId, incrementalEbitda: new Decimal(avoided[k]!).minus(costs[k]!).minus(fixed[k]!).toFixed(), growthCapex: capex[k], incrementalDepreciation: dep[k], operands: operands[k]}))},
          startupCapital: {operands: {}}, ramp: [{operands: {operationStartMonth: o.start ?? "2027-05-01"}, activeMonths: o.start ? 2 : 8, activeYearFraction: active[1], loadEquivalentYearFraction: load[1]}]}};
      };
      return [make("base", {}), make("economy-4", {avoided: ["0", "20", "20"]}), make("capex-120", {capex: ["12", "9.6", "0"], dep: ["2.16", "2.16", "2.16"]}),
        make("slower-start", {active: ["0", "0.2", "1"], load: ["0", "0.1", "0.95"], start: "2027-11-01"})];
    })()})];
    const action = (t: string): BoardDeliberation => ({...deliberation("v", ["2026-11-15"]), title: "delib.maturities|ano=y", deadlines: [{id: "rota", date: "2026-11-15", action: t}]});
    const context = {figures, deliberations: [action("delib.action.decide_route")], nextMeetingDate: null, sources};
    const render = (ref: string) => renderBoardRef(ref, context).display;
    expect(render("situation.debt_total|total=d|ano=y")).toBe("A dívida é de R$ 130 milhões, concentrada em 2027");
    expect(renderBoardRef("situation.debt_total|total=d|ano=y", context).bindings).toEqual([{templateId: "situation.debt_total", slot: "total", figureId: "d", deadlineId: null, informedId: null},
      {templateId: "situation.debt_total", slot: "ano", figureId: "y", deadlineId: null, informedId: null}]);
    // Type, then concept: the same dimension of another concept is refused.
    expect(() => render("situation.debt_total|total=r|ano=y")).toThrow("board_capital_slot_type_mismatch");
    expect(() => render("situation.debt_total|total=d|ano=d")).toThrow("board_capital_slot_type_mismatch");
    expect(() => render("situation.debt_total|total=deadline:v.rota|ano=y")).toThrow("board_capital_slot_type_mismatch");
    expect(() => render("situation.debt_total|total=b|ano=y")).toThrow("board_capital_slot_concept_mismatch:situation.debt_total:total");
    expect(() => render("topic.project_value|retorno=r|custo=r|vpl=n")).toThrow("board_capital_slot_concept_mismatch:topic.project_value:custo");
    // Conditions the fixed text asserts: concentration year, negative values, and a pending reading of the slot's method only.
    expect(() => render("situation.debt_total|total=d|ano=y26")).toThrow("board_capital_template_condition_failed:situation.debt_total:0");
    expect(render("topic.project_sensitivities|vpl_economia=e|vpl_capex=c|vpl_partida=s")).toContain("R$ -6,4 milhões");
    expect(() => render("topic.project_sensitivities|vpl_economia=ep|vpl_capex=c|vpl_partida=s")).toThrow("board_capital_template_condition_failed:topic.project_sensitivities:0");
    expect(render("option.staged|vpl=p")).toBe("Seguir em etapas: VPL de [pendente].");
    expect(() => render("situation.debt_total|total=p|ano=y")).toThrow("board_capital_slot_concept_mismatch:situation.debt_total:total:pending_origin");
    // A pending figure occupies only the slot of the field it stands for: the staged NPV never takes a rate slot.
    expect(() => render("topic.project_value|retorno=p|custo=r|vpl=n")).toThrow("board_capital_slot_concept_mismatch:topic.project_value:retorno:pending_origin");
    // A pending figure in its own slot leaves every condition that names it undefined, and undefined never holds.
    expect(() => render("topic.project_return|projeto=pl|retorno=r|custo=pw")).toThrow("board_capital_template_condition_undefined:topic.project_return:0");
    // A deadline is the deadline of the action the template announces.
    expect(render("next_steps.route|prazo=deadline:v.rota|ano=y")).toBe("15/nov: decisão da rota para os vencimentos de 2027.");
    expect(() => render("next_steps.notice|prazo=deadline:v.rota|projeto=project-label")).toThrow("board_capital_deadline_action_mismatch:next_steps.notice:prazo:v.rota");
    // A condition whose source is not in the material cannot be verified.
    // Absent source: the condition is undefined, never satisfied.
    expect(() => renderBoardRef("situation.debt_total|total=d|ano=y", {...context, sources: []})).toThrow("board_capital_template_condition_undefined:situation.debt_total");
  });
  it("property: three values; every condition of the library, with every operand absent or pending, is undefined and its sentence never comes out", () => {
    // Every slot bound to a pending figure of the exact field it admits (variables set to a placeholder), years to a
    // calendar reading, deadlines and informed facts to their own kinds; no source at all.
    const informed = (["chair", "cfo", "ceo"] as const).map((author) => ({id: `i-${author}`, origin: "informed" as const, author, code: "reduce_single_supplier_dependence"}));
    const actions = Object.entries(boardTemplates).filter(([, t]) => t.use.includes("delib.action")).map(([id]) => id);
    const holder: BoardDeliberation = {...deliberation("z", []), deadlines: actions.map((a, k) => ({id: `d${k}`, date: "2026-11-15", action: a}))};
    let undefinedCount = 0, constantOnly = 0;
    for (const [id, template] of Object.entries(boardTemplates)) for (const [i, c] of template.when.entries()) {
      const figures = new Map<string, BoardFigureDisplay>(), bindings: string[] = [];
      for (const [slot, spec] of Object.entries(template.slots)) {
        if (spec.type === "deadline") {bindings.push(`${slot}=deadline:z.d${actions.indexOf(spec.action!)}`); continue;}
        if (spec.type === "informed") {bindings.push(`${slot}=informed:i-${spec.author}`); continue;}
        const fid = `f-${slot.replace(/_/g, "-")}`;
        if (spec.year !== undefined) figures.set(fid, {display: "2027", unit: "calendar", origin: {sourceId: "s", methodId: "build-company-debt-table", path: "result.table.profile.scheduleByYear[year=2027].year", value: "2027"}});
        else figures.set(fid, {pending: true, methodId: spec.from![0]![0], path: spec.from![0]![1].replace(/\$y\b/g, "2027").replace(/\$[a-z]+/g, "x")});
        bindings.push(`${slot}=${fid}`);
      }
      const ref = [id, ...bindings].join("|"), original = boardTemplates[id]!, library = {...boardTemplates, [id]: {...original, when: [c]}};
      {
        let outcome = "rendered";
        try {renderBoardRef(ref, {figures, deliberations: [holder], nextMeetingDate: null, sources: [], informed, library});} catch (e) {outcome = String(e);}
        // A condition that reads nothing (only constants and variables already bound) may hold; any other is undefined.
        const readsData = !("bind" in c && "value" in c.to) && !("compare" in c && c.compare.every((o) => typeof o === "string" ? false : "value" in o || "var" in o));
        if (readsData) {expect(outcome, `${id}:${i}`).toContain(`board_capital_template_condition_undefined:${id}:0`); undefinedCount++;}
        else constantOnly++;
      }
    }
    expect(undefinedCount).toBeGreaterThan(150);
    expect(constantOnly).toBeLessThan(20);
  });
  it("property: every kind of order or sign condition holds on the exact values and on the values as shown, or the sentence does not come out", () => {
    const DT = "build-company-debt-table";
    const packet = {result: {table: {reconciliation: {principal: "2.5"}, profile: {scheduleByYear: [{year: 2026, principal: "2.459"}, {year: 2027, principal: "1"}]}}}};
    const sources = [{id: "t", methodId: DT, methodVersion: "v", executorVersion: null, packetSchemaVersion: "v", packetFingerprint: "f", status: "s", gaps: [], packet}] as unknown as BoardSourceReading[];
    const money = (path: string, nature: "balance" | "flow" = "balance") => ({type: "money" as const, from: [[DT, path]] as [string, string][], nature});
    const fig = (path: string, value: string, display: string): BoardFigureDisplay => ({display, unit: "money", origin: {sourceId: "t", methodId: DT, path, value}});
    const kinds: [string, BoardCondition][] = [
      ["slot below slot", {compare: [{slot: "x"}, "lt", {slot: "y"}], claim: "x abaixo de y"}],
      ["slot above slot", {compare: [{slot: "y"}, "gt", {slot: "x"}], claim: "y acima de x"}],
      ["slot below a source field", {compare: [{slot: "x"}, "lt", {at: [DT, "result.table.reconciliation.principal"]}], claim: "x abaixo do campo"}],
      ["slot below a constant", {compare: [{slot: "x"}, "lt", {value: "2.5"}], claim: "x abaixo da constante"}],
      ["negative sign", {compare: [{slot: "z"}, "lt", {value: "0"}], claim: "z negativo"}],
      ["positive sign", {compare: [{slot: "w"}, "gt", {value: "0"}], claim: "w positivo"}],
      ["every member below a slot", {every: [DT, "result.table.profile.scheduleByYear", "principal"], op: "lt", than: {slot: "y"}, claim: "todos abaixo de y"}],
    ];
    let checked = 0;
    for (const [name, condition] of kinds) for (const shownPlaces of [1, 2] as const) {
      // Exact: x 2,459 below y 2,5; z -0,011 negative; w 0,011 positive. Shown with one decimal they tie or lose their sign.
      const figures = new Map<string, BoardFigureDisplay>([
        ["x", fig("result.table.profile.scheduleByYear[year=2026].principal", "2.459", shownPlaces === 1 ? "R$ 2,5 milhões" : "R$ 2,46 milhões")],
        ["y", fig("result.table.reconciliation.principal", "2.5", "R$ 2,5 milhões")],
        ["z", fig("result.table.reconciliation.principal", "-0.011", shownPlaces === 1 ? "R$ 0,0 milhão" : "R$ -0,01 milhão")],
        ["w", fig("result.table.reconciliation.principal", "0.011", shownPlaces === 1 ? "R$ 0,0 milhão" : "R$ 0,01 milhão")]]);
      const library = {...boardTemplates, "zz.order": {text: "Valores {x}, {y}, {z} e {w}.", use: ["page.line"], when: [condition],
        slots: {x: money("result.table.profile.scheduleByYear[year=$a].principal", "flow"), y: money("result.table.reconciliation.principal"), z: money("result.table.reconciliation.principal"), w: money("result.table.reconciliation.principal")}} as typeof boardTemplates[string]};
      {
        const render = () => renderBoardRef("zz.order|x=x|y=y|z=z|w=w", {figures, deliberations: [], nextMeetingDate: null, sources, library});
        if (shownPlaces === 1) expect(render, name).toThrow("board_capital_display_order_lost:zz.order:0");
        else expect(render().display, name).toContain("Valores");
        checked++;
      }
    }
    expect(checked).toBe(kinds.length * 2);
  });
});
