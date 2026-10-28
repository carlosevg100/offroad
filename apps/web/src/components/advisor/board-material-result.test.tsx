import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {readBoardMaterialPacketBlocks} from "../../../../../packages/domain-contracts/src/lote4-board-material-result-blocks";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import own from "./board-material-result.messages.json";
import blocks from "../../../../../packages/domain-contracts/src/fixtures/board-material-result-blocks.json";
import {BoardMaterialResult} from "./board-material-result";

type Catalog = Record<string, unknown>;
const resolve = (catalog: Catalog, key: string): unknown => key.split(".")
  .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined), catalog);
/** The shared catalogs with this page's keys added, as the integration adds them to messages/*.json. */
const merge = (a: Catalog, b: Catalog): Catalog => Object.fromEntries([...new Set([...Object.keys(a), ...Object.keys(b)])].map((k) =>
  [k, a[k] && b[k] && typeof a[k] === "object" && typeof b[k] === "object" ? merge(a[k] as Catalog, b[k] as Catalog) : b[k] ?? a[k]]));
const catalogs = {"pt-BR": merge(pt as Catalog, own["pt-BR"] as Catalog), "en-US": merge(en as Catalog, own["en-US"] as Catalog)};

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: "pt-BR" | "en-US"; namespace: string}) => {
    const catalog = resolve(catalogs[locale], namespace) as Catalog;
    const t = (key: string, values?: Record<string, string>) => {
      const raw = resolve(catalog, key);
      if (typeof raw !== "string") throw new Error(`missing message ${namespace}.${key}`);
      return values ? raw.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name])) : raw;
    };
    t.has = (key: string) => typeof resolve(catalog, key) === "string";
    return t;
  },
}));

const view = readBoardMaterialPacketBlocks(blocks)!;
const b = own["pt-BR"].App.workExecutions.boardMaterial;
const unresolved = /(columns|exclusions|roles|authorities|outcomes|templates|sources|gapReasons|outlineQuestions)\.[a-z]/;
const noDash = /[\u2013\u2014]/;

/** Every leaf key of a catalog, dotted. */
const keys = (c: unknown, at = ""): string[] => c && typeof c === "object" ? Object.entries(c).flatMap(([k, v]) => keys(v, at ? `${at}.${k}` : k)) : [at];

describe("board material result (C47)", () => {
  it("shows the deliberations with deadlines, the pages, the summary, the questions, the check, what is pending and the withdrawal", async () => {
    expect(view).not.toBeNull();
    const html = renderToStaticMarkup(await BoardMaterialResult({locale: "pt-BR", view}));
    for (const text of ["Pedimos quatro decisões; três têm prazo", "A dívida é de R$ 130 milhões", "02/10/2026", "15/11/2026", b.summary, b.questions, "Por que não rolar",
      b.identity, b.columns.path, b.pending, "Condições dos programas de antecipação indicativas", b.omissions, b.outcomes.applied, b.notSent, b.sources["plano-2027"],
      b.exclusions.credit_approval, "Seguir em etapas"]) expect(html).toContain(text);
    expect(html).toContain("2 versões do material preservadas");
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("before the material shows the outline and only the questions that change it", async () => {
    const outline = {...view, framing: {...view.framing, stage: "outline" as const, version: null, agenda: null}, pages: [], questions: [], appendix: [], summary: null, versions: [], omissions: [],
      outline: {narrative: ["decisions", "situation", "recommendation"], questions: [{code: "template" as const, topicId: null, label: null}, {code: "board_has_seen" as const, topicId: "linha-embalagem", label: "revisão"}]}};
    const html = renderToStaticMarkup(await BoardMaterialResult({locale: "pt-BR", view: outline}));
    for (const text of [b.outlineFirst, b.questionsBefore, b.outlineQuestions.template, b.outlineQuestions.board_has_seen, "decisões; situação; recomendação"]) expect(html).toContain(text);
    expect(html).not.toContain(b.summary);
  });
  it("speaks the viewer's locale, and the two catalogs carry the same keys", async () => {
    const html = renderToStaticMarkup(await BoardMaterialResult({locale: "en-US", view}));
    expect(html).toContain(own["en-US"].App.workExecutions.boardMaterial.title);
    expect(html).not.toMatch(unresolved);
    expect(keys(own["en-US"]).sort()).toEqual(keys(own["pt-BR"]).sort());
    expect(JSON.stringify(own)).not.toMatch(noDash);
  });
});
