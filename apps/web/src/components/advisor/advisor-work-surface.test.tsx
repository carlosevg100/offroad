import {renderToStaticMarkup} from "react-dom/server";
import {NextIntlClientProvider} from "next-intl";
import {describe, expect, it} from "vitest";
import {AdvisorWorkSurface} from "./advisor-work-surface";
import {workSectionFromHash, workSectionHref, workSectionTargetFromHash} from "./advisor-work-links";

const messages = {AdvisorWorkSurface: {work: "Trabalho", results: "Resultados", version: "Versão {version}"}};
function render(selectedId: string) {
  return renderToStaticMarkup(<NextIntlClientProvider locale="pt-BR" messages={messages}>
    <AdvisorWorkSurface selectedId={selectedId} onSelect={() => {}} sections={[
      {id: "brief", title: "Reunião", version: 2, status: "Em revisão", content: <p>Brief persistido</p>},
      {id: "review", title: "Oportunidade", content: <p>Análise persistida</p>},
    ]} />
  </NextIntlClientProvider>);
}
describe("AdvisorWorkSurface", () => {
  it("renders only the selected persisted result with its supplied review state", () => {
    const html = render("brief");
    expect(html).toContain("Brief persistido");
    expect(html).not.toContain("Análise persistida");
    expect(html).toContain("Versão 2");
    expect(html).toContain("Em revisão");
    expect(html).toContain('href="#work-review"');
    expect(html).toContain('id="work-brief"');
  });
  it("falls back to an existing result when selection becomes stale", () => {
    expect(render("removed")).toContain("Brief persistido");
    expect(render("review")).toContain("Análise persistida");
  });
  it("round-trips stable section links and rejects unrelated or malformed hashes", () => {
    expect(workSectionFromHash(workSectionHref("brief / versão 2"))).toBe("brief / versão 2");
    expect(workSectionFromHash("#project-evidence")).toBeNull();
    expect(workSectionFromHash("#work-%E0%A4%A")).toBeNull();
    expect(workSectionFromHash("#work-")).toBeNull();
  });
  it("links to one entry of a section, which opens the section and names the entry (5D)", () => {
    const update = "a4210000-0000-4000-9000-000000000060";
    expect(workSectionHref("updates", update)).toBe(`#work-updates/${update}`);
    expect(workSectionFromHash(workSectionHref("updates", update))).toBe("updates");
    expect(workSectionTargetFromHash(workSectionHref("updates", update), "updates")).toBe(update);
    // A section id with a slash stays one encoded id, and a plain section link names no entry.
    expect(workSectionFromHash(workSectionHref("brief / versão 2", "x"))).toBe("brief / versão 2");
    expect(workSectionTargetFromHash(workSectionHref("updates"), "updates")).toBeNull();
    expect(workSectionTargetFromHash(workSectionHref("vault", update), "updates")).toBeNull();
    expect(workSectionTargetFromHash("#work-updates/%E0%A4%A", "updates")).toBeNull();
  });
});
