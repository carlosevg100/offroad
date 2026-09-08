import {NextIntlClientProvider} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it} from "vitest";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {AdvisorEvidenceInventory, type InventoryDocument, type InventoryRequirement} from "./advisor-evidence-inventory";

for (const locale of ["pt-BR", "en-US"] as const) {
  const messages = locale === "pt-BR" ? pt : en;
  const copy = messages.AdvisorEvidenceInventory;
  function render(documents: InventoryDocument[], requirements: InventoryRequirement[], coverage = {verified: 0, total: 0, notExamined: 0}) {
    return renderToStaticMarkup(<NextIntlClientProvider timeZone="UTC" locale={locale} messages={messages}>
      <AdvisorEvidenceInventory documents={documents} requirements={requirements} coverage={coverage} />
    </NextIntlClientProvider>);
  }
  describe(`AdvisorEvidenceInventory ${locale}`, () => {
    it("keeps processed documents separate from verified evidence and exposes unexamined requirements", () => {
      const html = render([{id: "doc", name: "Financial statements.pdf", size: 2048, status: "ready", version: 3}], [
        {id: "gap", label: "Contractual amortization", status: "not_examined", materiality: "blocking", reason: "Needed to calculate debt service"},
      ], {verified: 0, total: 1, notExamined: 1});
      expect(html).toContain("Financial statements.pdf");
      expect(html).toContain(copy.documentStatus.ready);
      expect(html).toContain(copy.processingIsNotVerification);
      expect(html).toContain(locale === "pt-BR" ? "Requisitos resolvidos: 0/1" : "Requirements resolved: 0/1");
      expect(html).toContain(locale === "pt-BR" ? "1 requisito não examinado" : "1 unexamined requirement");
      expect(html).toContain(copy.requirementStatus.not_examined);
      expect(html).toContain(copy.materiality.blocking);
      expect(html).toContain("Needed to calculate debt service");
      expect(html).toContain("<details><summary>");
      expect(html).toContain(locale === "pt-BR" ? "Versão 3" : "Version 3");
    });
    it("renders every declared processing status without exposing internal values for unknown states", () => {
      const statuses = ["quarantined", "scanning", "clean", "processing", "ready", "rejected", "failed"] as const;
      const html = render([...statuses.map((status) => ({id: status, name: `${status}.pdf`, size: 0, status})),
        {id: "unknown", name: "Budget.xlsx", size: null, status: "internal_secret_status"},
      ], []);
      for (const status of statuses) {
        expect(html).toContain(`${status}.pdf`);
        expect(html).toContain(copy.documentStatus[status]);
      }
      expect(html).toContain(copy.documentStatus.unknown);
      expect(html).not.toContain("internal_secret_status");
      expect(html).toContain(copy.noRequirements);
    });
    it("does not claim completeness for an empty inventory or unresolved coverage", () => {
      const html = render([], []);
      expect(html).toContain(copy.noFiles);
      expect(html).toContain(copy.noRequirements);
      expect(html).toContain(copy.coveragePending);
      expect(html).toContain(copy.processingIsNotVerification);
    });
    it("renders plural disclosure counts, all gaps and safe fallback assessments", () => {
      const html = render([{id: "1", name: "A.pdf", size: null, status: "processing"}, {id: "2", name: "B.pdf", size: null, status: "processing"}], [
        {id: "1", label: "Covenants", status: "missing", materiality: "high", reason: "Definitions required"},
        {id: "2", label: "Liquidity", status: "unexpected_status", materiality: "unexpected_impact", reason: null},
      ], {verified: 0, total: 2, notExamined: 2});
      expect(html).toContain(locale === "pt-BR" ? "2 arquivos recebidos" : "2 files received");
      expect(html).toContain(locale === "pt-BR" ? "2 pontos a esclarecer" : "2 points to clarify");
      expect(html).toContain(locale === "pt-BR" ? "2 requisitos não examinados" : "2 unexamined requirements");
      expect(html).toContain("Covenants");
      expect(html).toContain("Liquidity");
      expect(html).toContain(copy.requirementStatus.unknown);
      expect(html).toContain(copy.materiality.unknown);
      expect(html).toContain(copy.reasonPending);
      expect(html).not.toContain("unexpected_status");
    });
    it("escapes uploaded filenames and requirement prose", () => {
      const html = render([{id: "1", name: '<script>alert("file")</script>.pdf', size: null, status: "ready"}], [
        {id: "gap", label: "<iframe>", status: "missing", materiality: "high", reason: "<script>unsafe</script>"},
      ]);
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("<iframe>");
      expect(html).toContain("&lt;script&gt;");
    });
  });
}
