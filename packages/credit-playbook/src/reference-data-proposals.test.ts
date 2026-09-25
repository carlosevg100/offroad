import {existsSync, readdirSync, readFileSync} from "node:fs";
import {describe, expect, it} from "vitest";

import {referenceDataProposalFamilies, referenceDataProposals} from "./reference-data-proposals";
import {referenceDataRegistry} from "./reference-data";

const knowledge = new URL("../knowledge/reference-data/", import.meta.url);

type Node = Record<string, unknown>;

const registeredKeys = new Set(referenceDataRegistry.map((entry) => entry.key));
const KEY_TOKEN = /(?<![A-Za-z0-9_./-])((?:policy|market|scenario)\.[a-z0-9_-]+(?:\.[a-z0-9_-]+)*)/g;
const KEY_SHAPE = /^(?:policy|market|scenario)\.[a-z0-9_-]+(?:\.[a-z0-9_-]+)*$/;

/** A registered key, or a registered key followed by the path of one of its fields. */
const namesRegisteredKey = (token: string) =>
  registeredKeys.has(token) || [...registeredKeys].some((key) => token.startsWith(`${key}.`));

const isNode = (value: unknown): value is Node => typeof value === "object" && value !== null && !Array.isArray(value);

const valueOf = (key: string): unknown => {
  const entry = referenceDataRegistry.find((candidate) => candidate.key === key);
  if (!entry) throw new Error(`unregistered key ${key}`);
  return entry.value;
};

/** Values at a dotted path; an array on the way stands for each of its elements. */
const at = (value: unknown, path: string): unknown[] => {
  let current: unknown[] = [value];
  for (const segment of path.split(".")) {
    current = current
      .flatMap((node) => (Array.isArray(node) ? node : [node]))
      .filter((node): node is Node => isNode(node) && segment in node)
      .map((node) => node[segment]);
  }
  return current;
};

const single = (value: unknown, path: string): unknown => {
  const found = at(value, path);
  expect(found, path).toHaveLength(1);
  return found[0];
};

const walk = (value: unknown, visit: (node: Node, where: string) => void, where: string): void => {
  if (Array.isArray(value)) value.forEach((item, index) => walk(item, visit, `${where}[${index}]`));
  else if (isNode(value)) {
    visit(value, where);
    for (const [field, child] of Object.entries(value)) walk(child, visit, `${where}.${field}`);
  }
};

const strings = (value: unknown): string[] => {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(strings);
  if (isNode(value)) return Object.values(value).flatMap(strings);
  return [];
};

/** Field pairs by which one proposal points to a field of another key. */
const REFERENCE_PAIRS = [
  ["key", "field"],
  ["key", "fields"],
  ["key", "path"],
  ["key", "paths"],
  ["governedBy", "path"],
  ["cureKey", "cureField"],
  ["definitionKey", "definitionField"],
  ["methodKey", "methodField"],
] as const;

describe("reference data proposals", () => {
  it("proposes only registered keys, each as a draft that awaits the founder's review", () => {
    const registered = new Map(referenceDataRegistry.map((entry) => [entry.key, entry]));
    for (const [key, proposal] of Object.entries(referenceDataProposals)) {
      const entry = registered.get(key);
      expect(entry, key).toBeDefined();
      expect(entry!.status, key).toBe("draft");
      expect(entry!.value, key).toEqual(proposal.value);
      expect(entry!.validUntil, key).toBeNull();
      expect(proposal.version, key).toMatch(/^\d{4}\.\d{2}\.\d{2}-v\d+$/);
      expect(proposal.source.observedBy ?? "", key).toMatch(/aguardando revisão do fundador/);
    }
  });

  it("keeps the full professional text of each proposal in a parameter card headed by its key", () => {
    for (const [key, proposal] of Object.entries(referenceDataProposals)) {
      const [file, anchor] = proposal.documentation.split("#");
      expect(file, key).toMatch(/^knowledge\/reference-data\/[a-z0-9-]+\.md$/);
      expect(anchor, key).toBe(key);
      const path = new URL(file!.slice("knowledge/reference-data/".length), knowledge);
      expect(existsSync(path), key).toBe(true);
      expect(readFileSync(path, "utf8").split("\n"), key).toContain(`### ${key}`);
    }
  });

  it("leaves approval to the owner: no family carries a status of its own", () => {
    for (const family of Object.values(referenceDataProposalFamilies)) {
      for (const proposal of Object.values(family)) expect(proposal).not.toHaveProperty("status");
    }
  });
});

describe("consistency across the parameter families", () => {
  it("names only registered keys, in the proposals and in the cards", () => {
    const texts: Array<[string, string]> = [
      ...Object.entries(referenceDataProposals).flatMap(([key, proposal]) =>
        strings(proposal.value).map((text): [string, string] => [key, text])),
      ...readdirSync(knowledge).filter((file) => file.endsWith(".md")).map((file): [string, string] =>
        [file, readFileSync(new URL(file, knowledge), "utf8")]),
    ];
    for (const [where, text] of texts) {
      for (const [, token] of text.matchAll(KEY_TOKEN)) expect(namesRegisteredKey(token!), `${where}: ${token}`).toBe(true);
    }
  });

  it("resolves every field another key is said to govern", () => {
    let references = 0;
    for (const [key, proposal] of Object.entries(referenceDataProposals)) {
      walk(proposal.value, (node, where) => {
        for (const [keyField, pathField] of REFERENCE_PAIRS) {
          const target = node[keyField];
          const paths = node[pathField];
          if (typeof target !== "string" || !KEY_SHAPE.test(target) || paths === undefined) continue;
          references += 1;
          expect(registeredKeys.has(target), `${key}${where}.${keyField}`).toBe(true);
          for (const path of Array.isArray(paths) ? paths : [paths]) {
            expect(typeof path, `${key}${where}.${pathField}`).toBe("string");
            expect(at(valueOf(target), path as string).length, `${key}${where}: ${target} ${path as string}`).toBeGreaterThan(0);
          }
        }
      }, "");
    }
    expect(references).toBeGreaterThanOrEqual(26);
  });

  it("keeps each red-flag threshold equal to the number of the key that governs its test", () => {
    const detectors = valueOf("policy.red-flags.detectors") as {thresholds: Node; thresholdBasis: Node};
    const governed = Object.entries(detectors.thresholdBasis)
      .filter((entry): entry is [string, Node] => isNode(entry[1]) && typeof entry[1].governedBy === "string");
    expect(governed.map(([field]) => field).sort()).toEqual(["managementBiasPct", "periodEndRevenuePct", "pmrIncreaseDays", "stableRevenueChangePct"]);
    for (const [field, basis] of governed) {
      const governing = Number(single(valueOf(basis.governedBy as string), basis.path as string));
      const factor = basis.conversion === undefined ? 1 : 100;
      expect(Number(detectors.thresholds[field]), field).toBeCloseTo(governing * factor, 10);
    }
  });

  it("gives every acceleration event a cure class that the cure matrix defines", () => {
    const events = single(valueOf("policy.structure.acceleration-events"), "events") as Node[];
    const cureClasses = single(valueOf("policy.structure.acceleration-events"), "materialityConventions.cureClasses") as Node;
    const matrix = (single(valueOf("policy.structure.cure-waiver"), "cureMatrix") as Node[]).map((row) => row.event);
    expect(cureClasses.source).toBe("policy.structure.cure-waiver");
    for (const cureClass of cureClasses.classes as string[]) if (cureClass !== "none") expect(matrix, cureClass).toContain(cureClass);
    for (const event of events) expect(cureClasses.classes, String(event.id)).toContain(event.cureClass);
    for (const window of cureClasses.ownWindows as string[]) {
      const [id, field] = window.split(".");
      expect(events.find((event) => event.id === id)?.[field!], window).toBeDefined();
    }
    const crossDefaultEvents = single(valueOf("policy.structure.cross-default-threshold"), "events.eventIds") as string[];
    for (const id of crossDefaultEvents) expect(events.map((event) => event.id), id).toContain(id);
  });

  it("uses one number for the maturity wall, the design limit and the low band of the largest year", () => {
    const wall = single(valueOf("policy.structure.maturity_wall"), "shareOfGrossDebt");
    expect(single(valueOf("policy.structure.maturity-concentration"), "maxShareOfConsolidatedDebtPerPeriod")).toBe(wall);
    const bands = single(valueOf("policy.debt.maturity-concentration"), "metrics.peakYearShare.bands") as Node[];
    expect(bands.find((band) => band.band === "low")?.maximum).toBe(wall);
  });

  it("points routes, instruments and shock roles only at entries that exist", () => {
    const catalogue = (single(valueOf("policy.structure.route-catalogue"), "routes") as Node[]).map((route) => route.id);
    const instruments = single(valueOf("market.instrument.eligibility"), "instruments") as Node[];
    for (const instrument of instruments) {
      for (const routeId of instrument.routeIds as string[]) expect(catalogue, `${String(instrument.id)} ${routeId}`).toContain(routeId);
    }
    for (const route of single(valueOf("policy.structure.minimum-sellable"), "routes") as Node[]) {
      for (const routeId of route.routeCatalogueIds as string[]) expect(catalogue, `${String(route.route)} ${routeId}`).toContain(routeId);
    }
    const instrumentIds = instruments.map((instrument) => instrument.id);
    for (const [key, proposal] of Object.entries(referenceDataProposals)) {
      walk(proposal.value, (node, where) => {
        const pointsAtEligibility = node.key === "market.instrument.eligibility" || node.termsKey === "market.instrument.eligibility";
        if (!pointsAtEligibility) return;
        const ids = [node.instrumentId, ...(Array.isArray(node.instrumentIds) ? node.instrumentIds : [])].filter((id) => id !== undefined);
        for (const id of ids) expect(instrumentIds, `${key}${where}: ${String(id)}`).toContain(id);
      }, "");
    }
    const roles = single(valueOf("scenario.interest_rate.parallel_shock"), "roles") as Node;
    for (const scenario of ["downside", "severe"]) {
      const shock = at(valueOf("scenario.market.multi-factor"), "scenarios").flatMap((scenarios) => at(scenarios, `${scenario}.cdiShock`));
      expect(shock, scenario).toHaveLength(1);
      expect((shock[0] as Node).key).toBe("scenario.interest_rate.parallel_shock");
      expect(roles, scenario).toHaveProperty(String((shock[0] as Node).role));
    }
  });
});
