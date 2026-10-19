import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import {readDebtCapacityPacketBlocks, readFinancingComparisonPacketBlocks} from "@offroad/domain-contracts";

import en from "../../../messages/en-US.json";
import pt from "../../../messages/pt-BR.json";
import capacityBlocks from "../../../../../packages/domain-contracts/src/fixtures/capacity-result-blocks.json";
import comparisonBlocks from "../../../../../packages/domain-contracts/src/fixtures/comparison-result-blocks.json";
import {CapacityResult} from "./capacity-result";
import {ComparisonResult} from "./comparison-result";

type Catalog = Record<string, unknown>;
const resolve = (catalog: Catalog, key: string): unknown => key.split(".")
  .reduce<unknown>((node, part) => (node && typeof node === "object" ? (node as Catalog)[part] : undefined), catalog);

vi.mock("next-intl/server", () => ({
  getTranslations: async ({locale, namespace}: {locale: string; namespace: string}) => {
    const catalog = resolve((locale === "en-US" ? en : pt) as Catalog, namespace) as Catalog;
    const t = (key: string, values?: Record<string, string>) => {
      const raw = resolve(catalog, key);
      if (typeof raw !== "string") throw new Error(`missing message ${namespace}.${key}`);
      return values ? raw.replace(/\{(\w+)\}/g, (_match, name: string) => String(values[name])) : raw;
    };
    t.has = (key: string) => typeof resolve(catalog, key) === "string";
    return t;
  },
}));

const comparison = readFinancingComparisonPacketBlocks(comparisonBlocks)!;
const capacity = readDebtCapacityPacketBlocks(capacityBlocks)!;

describe("comparison result", () => {
  it("shows every offer in every case with the eliminatory facts named, and the reading", async () => {
    expect(comparison).not.toBeNull();
    const html = renderToStaticMarkup(await ComparisonResult({locale: "pt-BR", view: comparison}));
    for (const p of comparison.proposals) expect(html).toContain(p.label);
    for (const c of comparison.cases) expect(html).toContain(c.label);
    expect(html).toContain(pt.App.workExecutions.comparison.columns.ebitdaHeadroom);
    expect(html).toContain(pt.App.workExecutions.comparison.exclusions.choice_of_counterparty);
    expect(html).not.toMatch(/facts\.|exclusions\./);
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await ComparisonResult({locale: "en-US", view: comparison}));
    expect(html).toContain(en.App.workExecutions.comparison.title);
  });
});

describe("comparison result with gaps", () => {
  it("names offers without a complete reading apart instead of calling them unviable", async () => {
    const id = comparison.proposals[0]!.proposalId;
    const view = {...comparison, conclusion: {...comparison.conclusion, viableInEveryCaseProposalIds: [],
      cases: comparison.conclusion.cases.map((c, n) => n ? c : {...c, incompleteProposalIds: [id]})}};
    const html = renderToStaticMarkup(await ComparisonResult({locale: "pt-BR", view}));
    expect(html).toContain(pt.App.workExecutions.comparison.noneCompleteViableEverywhere);
    expect(html).toContain("Propostas sem leitura completa por lacuna: 1.");
    expect(html).not.toContain(id);
    expect(html).not.toContain(pt.App.workExecutions.comparison.noneViableEverywhere);
  });
});

describe("comparison result without a calculated scenario", () => {
  it("draws no conclusion over a scenario that was not calculated", async () => {
    const view = {...comparison, proposals: [], conclusion: {...comparison.conclusion, viableInEveryCaseProposalIds: [], cases: []}};
    const html = renderToStaticMarkup(await ComparisonResult({locale: "pt-BR", view}));
    expect(html).toContain(pt.App.workExecutions.comparison.noneCompleteViableEverywhere);
    expect(html).toContain("Cenários sem cálculo por lacuna: " + comparison.cases.map((c) => c.label).join("; "));
    expect(html).not.toContain(pt.App.workExecutions.comparison.noneViableEverywhere);
  });
});

describe("capacity result", () => {
  it("shows the capacity per schedule with the binding limit, every limit, the amount asked and the plan", async () => {
    expect(capacity).not.toBeNull();
    const html = renderToStaticMarkup(await CapacityResult({locale: "pt-BR", view: capacity}));
    for (const c of capacity.cases) expect(html).toContain(c.label);
    for (const l of capacity.limits) expect(html).toContain(l.label);
    expect(html).toContain(pt.App.workExecutions.capacity.byLimit);
    if (capacity.plan.length) expect(html).toContain(pt.App.workExecutions.capacity.plan);
    expect(html).not.toMatch(/scenarios\.|exclusions\.|columns\./);
  });
  it("names no binding scenario when the packet does not say it", async () => {
    const view = {...capacity, capacity: capacity.capacity.map((c) => ({...c, bindingScenario: null}))};
    const html = renderToStaticMarkup(await CapacityResult({locale: "pt-BR", view}));
    expect(html).not.toContain("adverso</small>");
    expect(html).toContain("em 2028");
  });
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await CapacityResult({locale: "en-US", view: capacity}));
    expect(html).toContain(en.App.workExecutions.capacity.title);
  });
});
