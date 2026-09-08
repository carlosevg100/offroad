import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {receivablesEvidenceScopeContextSchema} from "@offroad/receivables-analysis";
import {ReceivablesScopeCard} from "./receivables-scope-card";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
vi.mock("next/navigation", () => ({useRouter: () => ({refresh: vi.fn()})}));
vi.mock("@/app/[locale]/app/projects/[projectId]/actions", () => ({confirmReceivablesScope: vi.fn()}));
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = (n: number) => ({sourceDocumentId: id(n), documentVersion: 1, contentKind: "document_layer", sourceSha256: "a".repeat(64), contentSha256: "b".repeat(64), schemaVersion: "2026.08.28-v1", fileName: `Source ${n}.xlsx`});
const context = receivablesEvidenceScopeContextSchema.parse({state: "unconfirmed", scope: null, sourceManifest: {schemaVersion: "receivables-evidence-manifest.v1", fingerprint: "c".repeat(64), sources: [source(1), source(2), source(3)]}, candidates: [{documentId: id(1), fileName: "Pool A.xlsx", sheet: "A", headerRow: 1}, {documentId: id(2), fileName: "Pool B.xlsx", sheet: "B", headerRow: 2}]});
describe("receivables scope form", () => {
  it.each(["pt-BR", "en-US"] as const)("renders explicit selection and only non-tape supports in %s", (locale) => {
    const copy = (locale === "pt-BR" ? pt : en).ReceivablesScope;
    const html = renderToStaticMarkup(<ReceivablesScopeCard context={context} copy={copy} locale={locale} projectId={id(4)} sessionId={id(5)} />);
    expect(html).toContain(copy.confirm);
    expect(html).toContain(`<strong>Pool A.xlsx</strong>`);
    expect(html).toContain(`${copy.sheet} A`);
    expect(html).toContain(`${copy.headerRow} 1`);
    expect(html).toContain(`${copy.version} 1`);
    expect(html).toContain('name="reportingDate"');
    expect(html).toContain('name="scopeConfirmed"');
    expect(html.split('name="primaryTape"')).toHaveLength(3);
    expect(html.split('name="complementDocumentIds"')).toHaveLength(2);
    expect(html).toContain(`value="${id(3)}"`);
    expect(html).not.toContain(`value="${id(1)}"`);
    expect(html).not.toContain('checked=""');
    expect(html).not.toContain(copy.saved);
  });
  it("does not expose a confirmation form for unavailable discovery", () => {
    const html = renderToStaticMarkup(<ReceivablesScopeCard context={{state: "unavailable", scope: null, sourceManifest: null, candidates: []}} copy={en.ReceivablesScope} locale="en-US" projectId={id(4)} sessionId={id(5)} />);
    expect(html).toContain(en.ReceivablesScope.unavailable);
    expect(html).not.toContain('data-testid="receivables-scope-form"');
  });
  it("shows revalidation when the manifest becomes stale", () => {
    const html = renderToStaticMarkup(<ReceivablesScopeCard context={{...context, state: "stale"}} copy={pt.ReceivablesScope} locale="pt-BR" projectId={id(4)} sessionId={id(5)} />);
    expect(html).toContain(pt.ReceivablesScope.stale);
    expect(html).not.toContain(pt.ReceivablesScope.current);
  });
});
