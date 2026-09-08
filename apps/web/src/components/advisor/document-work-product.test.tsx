import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import messages from "../../../messages/pt-BR.json";
import {syntheticDocumentWorkProduct} from "@offroad/testing-fixtures/document-work-product";
import {documentWorkProductSchema} from "@offroad/domain-contracts";
const documentWorkProductFixture = documentWorkProductSchema.parse(syntheticDocumentWorkProduct);
import {DocumentWorkProduct} from "./document-work-product";

describe("DocumentWorkProduct", () => {
  it("renders substantive sections, hypotheses, gaps and inspectable quotations with a real supplied download", () => {
    const html = renderToStaticMarkup(<DocumentWorkProduct product={documentWorkProductFixture} labels={messages.App.documentWorkProduct} downloadHref="/authorized/material.docx" />);
    for (const value of ["Análise documental preliminar", "O consentimento já foi solicitado?", "Pode enviar a autorização?", "Consentimento prévio é necessário.", "Página 3", "Duas passagens"]) expect(html).toContain(value);
    expect(html).toContain('href="/authorized/material.docx"');
    expect(html).toContain("<details>");
    expect(html).toContain(documentWorkProductFixture.sources[0].documentName);
    expect(html).toContain(documentWorkProductFixture.sources[0].hash);
    expect(html).not.toContain("source-1");
    expect(html).not.toContain(documentWorkProductFixture.fingerprint);
  });
  it("never manufactures a download and escapes source text", () => {
    const product = {...documentWorkProductFixture, sources: documentWorkProductFixture.sources.map(source => ({...source, text: "<script>secret()</script>"}))};
    const html = renderToStaticMarkup(<DocumentWorkProduct product={product} labels={messages.App.documentWorkProduct} />);
    expect(html).not.toContain("Baixar Word");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
