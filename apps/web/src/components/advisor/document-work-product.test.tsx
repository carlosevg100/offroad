import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import messages from "../../../messages/pt-BR.json";
import {syntheticDocumentWorkProduct} from "@offroad/testing-fixtures/document-work-product";
import {documentWorkProductSchema} from "@offroad/domain-contracts";
const documentWorkProductFixture = documentWorkProductSchema.parse(syntheticDocumentWorkProduct);
import {DocumentWorkProduct} from "./document-work-product";

const render = (node: React.ReactNode) => renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" timeZone="UTC" messages={messages}>{node}</NextIntlClientProvider>);

describe("DocumentWorkProduct", () => {
  it("renders substantive sections, hypotheses, gaps and inspectable quotations with a real supplied download", () => {
    const html = render(<DocumentWorkProduct product={documentWorkProductFixture} labels={messages.App.documentWorkProduct} downloadBase="/authorized/material" />);
    for (const value of ["Análise documental preliminar", "O consentimento já foi solicitado?", "Pode enviar a autorização?", "Consentimento prévio é necessário.", "Página 3", "Duas passagens"]) expect(html).toContain(value);
    expect(html).toContain('href="/authorized/material/docx"');
    expect(html).toContain('href="/authorized/material/pdf"');
    // Qualitative text has neither a tabular nor a presentation contract of its own.
    expect(html).not.toContain("/authorized/material/xlsx");
    expect(html).not.toContain("/authorized/material/pptx");
    expect(html).toContain(messages.DeliverableFormats.conditions.approved_content_and_sources);
    expect(html).toContain("<details>");
    expect(html).toContain(documentWorkProductFixture.sources[0].documentName);
    expect(html).toContain(documentWorkProductFixture.sources[0].hash);
    expect(html).not.toContain("source-1");
    expect(html).not.toContain(documentWorkProductFixture.fingerprint);
  });
  it("never manufactures a download and escapes source text", () => {
    const product = {...documentWorkProductFixture, sources: documentWorkProductFixture.sources.map(source => ({...source, text: "<script>secret()</script>"}))};
    const html = render(<DocumentWorkProduct product={product} labels={messages.App.documentWorkProduct} />);
    expect(html).not.toContain("Baixar Word");
    expect(html).not.toContain("deliverable-formats");
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });
});
