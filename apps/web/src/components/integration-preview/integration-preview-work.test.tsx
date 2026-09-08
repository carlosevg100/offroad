import {NextIntlClientProvider} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {IntegrationPreviewWork, type PreviewArtifactView} from "./integration-preview-work";

function artifact(output: unknown, type = "preview_debt_ledger"): PreviewArtifactView {
  return {id: type, type, version: 1, status: "complete", createdAt: "2026-09-07T12:00:00Z", content: {preview: {methodMaturity: "implemented"}, output}};
}
function render(artifacts: PreviewArtifactView[], locale: "pt-BR" | "en-US" = "pt-BR") {
  return renderToStaticMarkup(<NextIntlClientProvider locale={locale} messages={locale === "pt-BR" ? pt : en} timeZone="UTC"><IntegrationPreviewWork artifacts={artifacts} locale={locale} materialHref="/material" /></NextIntlClientProvider>);
}

describe("integration preview review surface", () => {
  it("preserves financial precision and declared unit without interpreting ratios", () => {
    const input = artifact({state: "complete", unit: "BRL thousand", ratio: "0.21689377", amount: "9007199254740993.001", absent: null});
    const html = render([input]);
    expect(html).toContain("0,21689377");
    expect(html).not.toContain("0,21.689.377");
    expect(html).toContain("9.007.199.254.740.993,001");
    expect(html).toContain("Unidade monetária declarada");
    expect(html).toContain("BRL thousand");
    expect(html).toContain("Não informado");
    expect(render([input], "en-US")).toContain("9,007,199,254,740,993.001");
  });
  it("makes every row, heterogeneous column, nested anchor and long gap available in native disclosure", () => {
    const rows = Array.from({length: 13}, (_, index) => ({id: `row-${index}`, ...Object.fromEntries(Array.from({length: 9}, (_, column) => [`c${column}`, `${index}-${column}`])), ...(index === 12 ? {late_column: "last-cell", anchors: [{document: "Statement", page: 49, clause: "7.1"}]} : {})}));
    const gaps = Array.from({length: 11}, (_, index) => index === 10 ? {reason: "long-gap-" + "z".repeat(250), detail: "final-condition"} : `gap-${index}`);
    const html = render([artifact({ledger_rows: rows, uncovered_terms: gaps})]);
    expect(html).toContain("Ver tabela completa: 13 linhas, 12 colunas");
    expect(html).toContain("last-cell");
    expect(html).toContain("Statement");
    expect(html).toContain("7.1");
    expect(html).toContain("Ver mais 1 lacuna");
    expect(html).toContain("z".repeat(250));
    expect(html).toContain("final-condition");
    expect(html).toContain('<details><summary>');
    expect(html).toContain('scope="col"');
    expect(html).toContain('tabindex="0"');
  });
  it("renders material sections independently of the meeting brief", () => {
    const html = render([artifact({sections: [{id: "thesis", title: "Decision thesis", paragraphs: [{text: "A grounded conclusion.", references: []}]}], source: {kind: "deterministic"}}, "preview_material")], "en-US");
    expect(html).toContain("Decision thesis");
    expect(html).toContain("A grounded conclusion.");
    expect(html).toContain('href="/material?format=docx"');
    expect(html).toContain("Download the Word file");
  });
  it("escapes untrusted output and keeps missing or primitive rows inspectable", () => {
    const html = render([artifact({ledger_rows: [null, "<script>bad()</script>", {id: "final"}]})]);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Não informado");
    expect(html).toContain("final");
  });
});
