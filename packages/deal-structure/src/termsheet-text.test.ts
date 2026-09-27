import {archetypes} from "@offroad/credit-playbook";
import {describe, expect, it} from "vitest";

import type {CapacityAssessment} from "./capacity";
import type {MarketBand} from "./market";
import {buildTermSheet, termBasisLabels} from "./termsheet";

/**
 * The visible text of the indicative term sheet shows no dash and no internal identifier (stage 19,
 * post-closure polish), for every archetype and every branch of its sentences: no tenor or grace
 * stated, inside the band, below it and above it, each binding constraint, and a band observed in
 * the market. The limits of a band are written in words, "entre 48 e 84 meses".
 */
describe("the term sheet states its bands in words", () => {
  const texts: Array<{where: string; text: string}> = [];
  for (const definition of archetypes) {
    for (const bindingConstraint of ["cash_flow", "collateral", "arr_and_round", "market", null] as const) {
      const capacity = {requested: "40000000", recommended: bindingConstraint ? "30000000" : "40000000", bindingConstraint} as unknown as CapacityAssessment;
      for (const requestedTermMonths of [undefined, 6, 60, 400]) {
        for (const requestedGraceMonths of [undefined, 0, 12, 60]) {
          for (const market of [undefined, {archetypeId: definition.id, tenorMonths: {min: 36, max: 72}, leverageCeiling: "3", provenance: "observed", sample: {count: 14, windowMonths: 12}} as MarketBand]) {
            const sheet = buildTermSheet({
              archetypeId: definition.id, capacity, expectedRate: "CDI + 4,00% a.a.",
              ...(requestedTermMonths === undefined ? {} : {requestedTermMonths}),
              ...(requestedGraceMonths === undefined ? {} : {requestedGraceMonths}),
              ...(market ? {market} : {}),
            });
            for (const term of sheet.terms) {
              for (const lang of ["pt", "en"] as const) {
                const where = `${definition.id}:${term.id}:${lang}`;
                texts.push({where, text: term.labels[lang]}, {where, text: term.value[lang]}, {where, text: term.rationale[lang]}, {where, text: termBasisLabels[term.basis][lang]});
                if (term.divergence) texts.push({where, text: term.divergence.requested[lang]}, {where, text: term.divergence.reason[lang]});
              }
            }
            for (const item of [...sheet.covenants, ...sheet.collateral, sheet.disclaimer.pt, sheet.disclaimer.en]) texts.push({where: `${definition.id}:list`, text: item});
          }
        }
      }
    }
  }

  it("prints no dash and no internal identifier in any term, list or disclaimer", () => {
    expect(texts.length).toBeGreaterThan(1000);
    expect(texts.filter(({text}) => /[‒–—―]/.test(text)).map(({where}) => where)).toEqual([]);
    expect(texts.filter(({text}) => /\b[a-z0-9]+_[a-z0-9_]+\b/.test(text)).map(({where}) => where)).toEqual([]);
  });

  it("writes the limits of the tenor and grace bands in words, in both languages", () => {
    const definition = archetypes[0]!;
    const capacity = {requested: "40000000", recommended: "40000000", bindingConstraint: null} as unknown as CapacityAssessment;
    const [low, high] = definition.structure.tenorMonths.typical;
    const [graceLow, graceHigh] = definition.structure.gracePeriodMonths.typical;
    const sheet = buildTermSheet({archetypeId: definition.id, capacity});
    const tenor = sheet.terms.find((term) => term.id === "tenor")!;
    const grace = sheet.terms.find((term) => term.id === "grace")!;
    expect(tenor.rationale.pt).toContain(`(entre ${low} e ${high} meses)`);
    expect(tenor.rationale.en).toContain(`(between ${low} and ${high} months)`);
    expect(grace.rationale.pt).toContain(`A banda usual desta operação fica entre ${graceLow} e ${graceHigh} meses`);
    expect(grace.rationale.en).toContain(`The usual band for this operation is between ${graceLow} and ${graceHigh} months`);
  });
});
