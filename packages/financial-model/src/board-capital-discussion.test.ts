import {describe, expect, it} from "vitest";
import {boardFreeTextIssue, boardNumberTokens, formatBoardReading, verifyBoardRendered, checkBoardText, orderBoardDeliberations, orderBoardPages, readBoardSourcePath, renderBoardTemplate,
  type BoardDeliberation, type BoardFigureDisplay, type BoardPage} from "./board-capital-discussion";
import type {BoardFieldSpec} from "./board-capital-discussion-sources";

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
    const pages = [page("rec", "recommendation"), page("dec", "decisions"), page("line", "topic", "line"), page("debt", "situation")];
    expect(orderBoardPages(pages, [{id: "line", label: "linha", seen: false}]).main.map((p) => p.id)).toEqual(["dec", "debt", "line", "rec"]);
    expect(orderBoardPages(pages, [{id: "line", label: "linha", seen: null}]).main.map((p) => p.id)).toEqual(["dec", "debt", "line", "rec"]);
    const seen = orderBoardPages(pages, [{id: "line", label: "linha", seen: true}]);
    expect([seen.main.map((p) => p.id), seen.appendix.map((p) => p.id)]).toEqual([["dec", "debt", "rec"], ["line"]]);
  });
  it("tokenizes every number of a final text once: sign, separators, dates and months of a year", () => {
    expect(boardNumberTokens("R$ -9,5 mi em 21/dez; 130,3 e 1.303; dez/26; 2027; 16%; 2,2x; +3; \u22121").map((t) => t.text))
      .toEqual(["-9,5", "21/dez", "130,3", "1.303", "dez/26", "2027", "16", "2,2", "+3", "\u22121"]);
  });
  it("verifies the final text: markers are the formatter's text, free text passes the whitelist, no preposition before a date or a value", () => {
    const figures = new Map<string, BoardFigureDisplay>([["d", {display: "R$ 130 milhões", unit: "money"}], ["b", {display: "R$ 3 milhões", unit: "money"}],
      ["r", {display: "1,2% ao ano", unit: "rate"}], ["w", {display: "1,5 anos", unit: "years"}], ["y", {display: "2027", unit: "calendar"}], ["l", {display: "Economia de R$ 4 milhões por ano", unit: "label"}]]);
    const context = {figures, deliberations: [], nextMeetingDate: null};
    const check = (t: string) => verifyBoardRendered("f", renderBoardTemplate(t, context), figures);
    expect(check("A dívida é {d}, concentrada {em:y}, a CDI mais {r}; prazo de {w}; {l}")).toBe(5);
    // Two markers side by side stay two whole numbers; they never form a new one.
    expect(check("{d},{b}")).toBe(2);
    for (const [t, why] of [["{d}{b}", "glued_to_marker"], ["A dívida equivale a {em:y}", "preposition_before_marker"], ["fecha em {d}", "preposition_before_marker"],
      ["dívida de até {d}", "preposition_before_marker"], ["A dívida é de {em:y} CAD.", "number_without_origin"], ["Retorno de {r} ao mês", "number_without_origin"]] as const)
      expect(() => check(t), t).toThrow(why);
    expect(() => verifyBoardRendered("f", {display: "R$ 131 milhões", spans: [{start: 0, end: 14, kind: "figure", id: "d", unit: "money"}]}, figures)).toThrow("marker_text");
    expect(() => verifyBoardRendered("f", {display: "Dívida \uff11\uff13\uff10 e R$ 130 milhões", spans: [{start: 13, end: 27, kind: "figure", id: "d", unit: "money"}]}, figures)).toThrow("without_marker");
  });
  it("shows money only in reais", () => {
    expect(() => formatBoardReading("130", {kind: "money", scale: "millions", period: "none", formats: []}, "0", "130", "USD")).toThrow("board_capital_currency_not_supported:USD");
  });
});
