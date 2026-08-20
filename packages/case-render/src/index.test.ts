import {describe, expect, it} from "vitest";
import type {Material} from "@offroad/case-materials";

import {escapeHtml, renderMaterialHtml} from "./html";

const material = (blocks: Material["blocks"]): Material => ({
  kind: "credit_profile",
  title: {pt: "Perfil de crédito", en: "Credit profile"},
  blocks,
  dependsOn: [],
});

const meta = {issuedOn: "2026-08-20"};

describe("renderMaterialHtml", () => {
  it("escapes text that came from a model reading a company's documents", () => {
    // A legal name with an ampersand is ordinary; a model emitting a tag is not, but it is
    // exactly the case where an unescaped template stops being a document and starts being
    // a vulnerability.
    const html = renderMaterialHtml({
      material: material([
        {type: "paragraph", text: {pt: '<script>alert("x")</script> Alfa & Beta', en: "x"}},
      ]),
      lang: "pt",
      meta: {...meta, companyName: 'Alfa & Beta "Holdings" <Ltda>'},
    });

    expect(html).not.toContain("<script>alert");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Alfa &amp; Beta");
    expect(html).toContain("&quot;Holdings&quot;");
  });

  it("keeps a claim's citations and resolves them in the appendix", () => {
    const html = renderMaterialHtml({
      material: material([
        {type: "paragraph", text: {pt: "EBITDA cresceu.", en: "EBITDA grew."}, supportIds: ["f.ebitda"]},
        {
          type: "metrics",
          items: [
            {label: {pt: "Dívida líquida", en: "Net debt"}, value: "1000", formatted: {pt: "R$ 1.000", en: "R$ 1,000"}, supportIds: ["f.net_debt", "f.ebitda"]},
          ],
        },
      ]),
      lang: "pt",
      meta: {
        ...meta,
        sources: [
          {id: "f.ebitda", label: "historical_financials.2025.ebitda", document: "DRE auditada 2025"},
          {id: "f.net_debt", label: "calculated.net_debt"},
        ],
      },
    });

    // First marker seen is 1; the metric reuses it rather than minting a second number.
    expect(html).toContain('<sup class="cite">1</sup>');
    expect(html).toContain('<sup class="cite">2,1</sup>');
    expect(html).toContain("historical_financials.2025.ebitda");
    expect(html).toContain("DRE auditada 2025");
  });

  it("prints an unresolved marker instead of hiding a broken trace", () => {
    const html = renderMaterialHtml({
      material: material([{type: "paragraph", text: {pt: "Alegação.", en: "Claim."}, supportIds: ["f.unknown"]}]),
      lang: "pt",
      meta,
    });
    expect(html).toContain('<sup class="cite">1</sup>');
    expect(html).toContain("f.unknown");
  });

  it("omits the appendix when the document makes no cited claim", () => {
    const html = renderMaterialHtml({
      material: material([{type: "heading", text: {pt: "Operação", en: "Transaction"}}]),
      lang: "pt",
      meta,
    });
    expect(html).not.toContain('class="sources"');
  });

  it("repeats table headers across printed pages", () => {
    const html = renderMaterialHtml({
      material: material([
        {
          type: "table",
          caption: {pt: "Fontes e usos", en: "Sources and uses"},
          head: [{pt: "Item", en: "Item"}, {pt: "Valor", en: "Amount"}],
          rows: [["Capex", "1.000"]],
        },
      ]),
      lang: "pt",
      meta,
    });
    expect(html).toContain("display: table-header-group");
    expect(html).toContain("<th>Item</th>");
    expect(html).toContain("<td>Capex</td>");
  });

  it("carries the date and the confidentiality mark, in the reader's language", () => {
    const pt = renderMaterialHtml({material: material([]), lang: "pt", meta});
    const en = renderMaterialHtml({material: material([]), lang: "en", meta});
    expect(pt).toContain("Confidencial");
    expect(pt).toContain("Emitido em 2026-08-20");
    expect(pt).toContain('lang="pt-BR"');
    expect(en).toContain("Confidential");
    expect(en).toContain('lang="en-US"');
  });

  it("only opens the print dialog when asked", () => {
    expect(renderMaterialHtml({material: material([]), lang: "pt", meta})).not.toContain("window.print");
    expect(renderMaterialHtml({material: material([]), lang: "pt", meta: {...meta, autoPrint: true}})).toContain("window.print");
  });
});

describe("escapeHtml", () => {
  it("leaves ordinary prose untouched", () => {
    expect(escapeHtml("EBITDA ajustado de R$ 12,4 milhões")).toBe("EBITDA ajustado de R$ 12,4 milhões");
  });
});
