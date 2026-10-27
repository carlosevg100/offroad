import {describe, expect, it} from "vitest";
import {boardLiteralNumbers, checkBoardFigure, checkBoardText, orderBoardDeliberations, orderBoardPages, readBoardSourcePath, renderBoardTemplate,
  type BoardDeliberation, type BoardFigureDisplay, type BoardPage} from "./board-capital-discussion";

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
  it("rounds half up after scaling and compares with the stated number", () => {
    expect(checkBoardFigure("0.15803214919295541016", "percent", 2, 0, "16")).toMatchObject({display: "16", matches: true});
    expect(checkBoardFigure("1.451141144531085353", "years", 0, 1, "1.4")).toMatchObject({rounded: "1.5", matches: false});
    expect(checkBoardFigure("-165000", "brl_millions", -6, 2, "-0.17")).toMatchObject({display: "-0,17", matches: true});
    expect(checkBoardFigure(4, "months", 0, 0, "4")).toMatchObject({display: "4", matches: true});
    expect(checkBoardFigure("2026-12-21", "date_day_month", 0, 0, "2026-12-21")).toMatchObject({display: "21/dez", matches: true});
    expect(checkBoardFigure("2027-09-15", "date_month_year", 0, 0, "2027-09-15")).toMatchObject({display: "set/27", matches: true});
    expect(checkBoardFigure("not a number", "brl_millions", 0, 0, "1")).toBeNull();
    expect(checkBoardFigure(undefined, "text", 0, 0, null)).toBeNull();
    expect(checkBoardFigure(true, "boolean", 0, 0, null)).toMatchObject({display: "sim", matches: true});
  });
  it("allows years and months of a year as literals and refuses any other literal number", () => {
    expect(boardLiteralNumbers("Vencimentos de 2027, em dez/26 e {lev}x")).toEqual([]);
    expect(boardLiteralNumbers("A dívida é de R$ 130 milhões")).toEqual(["130"]);
    expect(boardLiteralNumbers("Aviso até 2/out")).toEqual(["2"]);
    const context = {figures: new Map<string, BoardFigureDisplay>([["x", {display: "1,5", unit: "years"}], ["r", {display: "1,2", unit: "percent"}], ["p", {pending: true}]]), deliberations: [deliberation("a", ["2026-10-02"]), deliberation("b", [])], nextMeetingDate: null};
    expect(renderBoardTemplate("{count:deliberations} decisões, {count:dated} com prazo; {x} e {p}; até {deadline:a.d0}", context))
      .toEqual({display: "duas decisões, uma com prazo; 1,5 e [pendente]; até 2/out", figureIds: ["x"], pendingFigureIds: ["p"], deadlineIds: ["a.d0"]});
    expect(() => renderBoardTemplate("R$ 77 milhões", context)).toThrow("board_capital_number_without_origin");
    expect(() => renderBoardTemplate("{y}", context)).toThrow("board_capital_unknown_token:y");
    expect(() => renderBoardTemplate("{count:due-before-next-meeting}", context)).toThrow("board_capital_number_without_origin:next_meeting_date");
    expect(renderBoardTemplate("CDI mais {r}% ao ano", context).display).toBe("CDI mais 1,2% ao ano");
    expect(() => renderBoardTemplate("CDI mais {r} ao ano", context)).toThrow("board_capital_unit_missing:r");
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
});
