import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import folderBlocks from "../../../../../packages/domain-contracts/src/fixtures/document-folder-result-blocks.json";
import updateBlocks from "../../../../../packages/domain-contracts/src/fixtures/document-folder-update-result-blocks.json";
import {readDocumentFolderPacketBlocks} from "../../../../../packages/domain-contracts/src/lote4-document-folder-result-blocks";
import own from "./document-folder-result.messages.json";
import {DocumentFolderResult} from "./document-folder-result";

type Catalog = Record<string, unknown>;
const resolve = (catalog: Catalog, key: string): unknown => key.split(".")
  .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined), catalog);
// The catalogs with this page's keys under App.workExecutions.documentFolder, as the integration adds them.
const withOwn = (base: Catalog, locale: "pt-BR" | "en-US") => {
  const c = structuredClone(base) as {App: {workExecutions: Record<string, unknown>}};
  c.App.workExecutions.documentFolder = own[locale];
  return c as Catalog;
};
const catalogs = {"pt-BR": withOwn(pt as Catalog, "pt-BR"), "en-US": withOwn(en as Catalog, "en-US")};

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

const folder = readDocumentFolderPacketBlocks(folderBlocks)!, update = readDocumentFolderPacketBlocks(updateBlocks)!;
const w = own["pt-BR"];
const unresolved = /(columns|exclusions|modes|resolutions|checkStatuses|gapReasons)\.[a-z]/;
const noDash = /[\u2013\u2014]/;

describe("document folder result (C09)", () => {
  it("leads with the size, then what matters for the decisions in course with its source, the versions, the inventory, what was not read and what is missing", async () => {
    expect(folder).not.toBeNull();
    const html = renderToStaticMarkup(await DocumentFolderResult({locale: "pt-BR", view: folder}));
    for (const text of ["30 arquivos organizados por assunto", w.decisionFindings, "DF_2025_final.pdf", "Escritura debenture 2021.pdf, p. 18", w.resolutions.audited_over_draft,
      "Copia de Copia de tabela final (2).xlsx", "duplicado", "lida, exceto a página 7, ilegível", w.notRead, "Balancete de março de 2026", w.questions, w.notValidated,
      w.exclusions.document_validation, w.modes.organize]) expect(html).toContain(text);
    expect(html.indexOf(w.decisionFindings)).toBeLessThan(html.indexOf(w.versions));
    expect(html.indexOf(w.versions)).toBeLessThan(html.indexOf(w.inventory));
    expect(html).not.toContain(w.update);
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("shows on the later turn only what the arrival changed, the identity check and the informed fact with author and date", async () => {
    const html = renderToStaticMarkup(await DocumentFolderResult({locale: "pt-BR", view: update}));
    for (const text of [w.update, "Linhas atualizadas: CCB Bradesco 2024 scan.pdf.", "Linhas novas: balancete mar26.xlsx.", "29 linhas preservadas", "27,00", w.checkStatuses.matches,
      "A minuta não foi para nenhum banco. (informado por Controller da Aurora em 02/09/2026)"]) expect(html).toContain(text);
    expect(html).not.toMatch(unresolved); expect(html).not.toMatch(noDash);
  });
  it("speaks the viewer's locale and keeps the method's sentences as written", async () => {
    const html = renderToStaticMarkup(await DocumentFolderResult({locale: "en-US", view: folder}));
    for (const text of [own["en-US"].title, own["en-US"].decisionFindings, "30 files organized by subject", own["en-US"].exclusions.projection]) expect(html).toContain(text);
    expect(html).not.toMatch(unresolved);
  });
  it("has the same keys in both locales", () => {
    const keys = (o: unknown, p = ""): string[] => o && typeof o === "object" ? Object.entries(o).flatMap(([k, v]) => keys(v, `${p}${k}.`)) : [p];
    expect(keys(own["en-US"])).toEqual(keys(own["pt-BR"]));
    expect(JSON.stringify(own)).not.toMatch(noDash);
  });
});
