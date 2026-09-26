import type {MethodRef, PremiseRef} from "./work-update-view";

/** The part of next-intl's translator for `App.workUpdateNames` the names need. */
export type WorkUpdateNameTranslator = Readonly<{
  text: (key: string, values?: Record<string, string | number>) => string;
  has: (key: string) => boolean;
}>;

/**
 * Names a finance professional recognizes, resolved on the server from what the update view reads
 * in persisted rows. Internal keys (a method's catalogue id, a premise's dotted field path) select a
 * name and are never one.
 */
export type WorkUpdateNames = Readonly<{
  /** The house release title when the execution pinned one, else the title of the published
   * method catalogue in the person's language, else the neutral phrase for this basis analysis. */
  method: (ref: MethodRef | null) => string;
  /** The metric as the basis names it, else the definition the person adopted, else null: the
   * text then speaks of a working-basis assumption. */
  premise: (ref: PremiseRef | null) => string | null;
  /** One name shared by several executions, with how many. */
  repeated: (name: string, count: number) => string;
  /** The results of the work's financial model (the institutional model), as one dependent. */
  institutionalModel: () => string;
}>;

/** Metrics the basis names in words. Any other one is named by the definition the person adopted. */
const metricNames: ReadonlyMap<string, string> = new Map([
  ["financials.net_debt", "netDebt"],
  ["financials.ebitda", "ebitda"],
  ["liquidity.available_cash", "availableCash"],
  ["liquidity.restricted_cash", "restrictedCash"],
]);
const catalogueId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** A dotted key such as a field path. A definition that carries one is not used as a name. */
export const dottedKeyPattern = /\b[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+\b/;
const definitionLength = 120;

function firstLine(value: string | null | undefined): string | null {
  const line = value?.split(/\r?\n/, 1)[0]?.replace(/\s+/g, " ").trim();
  return line ? line : null;
}

export function workUpdateNames(t: WorkUpdateNameTranslator): WorkUpdateNames {
  return {
    method(ref) {
      const house = firstLine(ref?.houseTitle);
      if (house) return house;
      const id = ref?.methodId ?? null;
      if (id && catalogueId.test(id) && t.has(`methods.${id}`)) return t.text(`methods.${id}`);
      return t.text("unnamedMethod");
    },
    premise(ref) {
      if (!ref) return null;
      const metric = metricNames.get(ref.fieldPath);
      if (metric) return t.text(`metrics.${metric}`);
      const definition = firstLine(ref.definition);
      if (!definition || dottedKeyPattern.test(definition) || definition.includes(ref.fieldPath)) return null;
      return definition.length > definitionLength ? `${definition.slice(0, definitionLength - 1).trimEnd()}…` : definition;
    },
    repeated: (name, count) => count > 1 ? t.text("repeated", {name, count}) : name,
    institutionalModel: () => t.text("institutionalModel"),
  };
}
