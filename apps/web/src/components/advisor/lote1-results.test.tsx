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
      if (typeof raw !== "string") return key;
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
  it("speaks the viewer's locale", async () => {
    const html = renderToStaticMarkup(await CapacityResult({locale: "en-US", view: capacity}));
    expect(html).toContain(en.App.workExecutions.capacity.title);
  });
});
