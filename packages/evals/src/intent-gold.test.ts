import {compileSemanticObjects, namedCompositionKeys, namedCompositions, primaryWorkSchema} from "@offroad/agent-contracts";
import {describe, expect, it} from "vitest";

import {intentGoldCoverage, intentGoldTurns, stabilityIntentTurnIds} from "./intent-gold";
import {intentGoldClassifierInput, intentGoldObjectInput} from "./intent-router-gate-input";

describe("intent gold turns", () => {
  it("covers every primary work, so a constant classifier cannot pass", () => {
    const coverage = intentGoldCoverage();
    for (const work of primaryWorkSchema.options) expect(coverage.works, work).toContain(work);
  });

  it("covers every responsibility encoded by the canonical composition policy", () => {
    const coverage = intentGoldCoverage();
    const policyResponsibilities = [...new Set(Object.values(namedCompositions).flatMap((policy) => policy.workResponsibilities))];
    for (const responsibility of policyResponsibilities) {
      expect(coverage.responsibilities, responsibility).toContain(responsibility);
    }
  });

  it("names only compositions the catalogue knows", () => {
    for (const entry of intentGoldTurns) {
      if (entry.expected.composition) expect(Object.keys(namedCompositions), entry.id).toContain(entry.expected.composition);
    }
  });

  it("includes the situations the router must handle beyond the happy path", () => {
    expect(intentGoldTurns.some((entry) => entry.expected.abstain)).toBe(true);
    expect(intentGoldTurns.some((entry) => entry.expected.depth === "point")).toBe(true);
    expect(intentGoldTurns.some((entry) => entry.expected.continuity === "refresh")).toBe(true);
    expect(intentGoldTurns.some((entry) => entry.expected.primaryWorks.length > 1)).toBe(true);
    expect(intentGoldTurns.some((entry) => entry.priorTurns.length > 0 && entry.expected.continuity === "new")).toBe(true);
  });

  it("has exactly forty unique base turns across the four required suites", () => {
    const ids = intentGoldTurns.map((entry) => entry.id);
    expect(intentGoldTurns).toHaveLength(40);
    expect(new Set(ids).size).toBe(ids.length);
    expect(Object.fromEntries(["journey", "horizontal", "confusion", "adversarial"].map((suite) => [suite, intentGoldTurns.filter((turn) => turn.suite === suite).length]))).toEqual({
      journey: 17,
      horizontal: 8,
      confusion: 7,
      adversarial: 8,
    });
  });

  it("covers all twenty compositions and has an explicit semantic answer key per turn", () => {
    expect(new Set(intentGoldCoverage().compositions)).toEqual(new Set(namedCompositionKeys));
    for (const turn of intentGoldTurns) {
      expect(turn.expected.semantic.canonicalAction).toBeTruthy();
      if (turn.expected.abstain) expect(turn.expected.semantic.objects.length, turn.id).toBe(0);
      else expect(turn.expected.semantic.objects.length, turn.id).toBeGreaterThan(0);
      expect(turn.expected.semantic.objects.map(({ordinal}) => ordinal)).toEqual(turn.expected.semantic.objects.map((_, index) => index + 1));
      expect(new Set(turn.expected.semantic.objects.map(({id}) => id)).size).toBe(turn.expected.semantic.objects.length);
      for (const object of turn.expected.semantic.objects) {
        expect(object.id).toBe(`object-${object.ordinal}`);
        expect(object.allowAdditional).toBe(false);
        expect(new Set(object.slots.map(({key}) => key)).size).toBe(object.slots.length);
      }
      expect(turn.expected.semantic.decision.category).toBeTruthy();
      expect(turn.expected.semantic.audienceCategory).toBeTruthy();
    }
  });

  it("keeps every oracle head realizable from each authored message or governed active work context", () => {
    const normalize = (value: string) => value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
      .toLocaleLowerCase("pt-BR").replace(/\s+/g, " ").trim();
    for (const turn of intentGoldTurns) {
      const messages = [turn.message, ...(turn.stabilityParaphrases ?? [])];
      for (const message of messages) {
        for (const object of turn.expected.semantic.objects) {
          const heads = object.slots.filter(({key}) => key === "entity" || key === "subject");
          expect(heads, `${turn.id}:${object.id}:exactly_one_head`).toHaveLength(1);
          const head = heads[0]!;
          const inCurrentTurn = head.allowedValues.some((value) => normalize(message).includes(normalize(value)));
          const inGovernedContext = turn.activeWorkContext?.objects.some((contextObject) =>
            contextObject.kind === object.kind
            && contextObject.slots.some((slot) => slot.key === head.key
              && head.allowedValues.map(normalize).includes(normalize(slot.value)))) ?? false;
          expect(inCurrentTurn || inGovernedContext, `${turn.id}:${object.id}:${head.allowedValues.join("|")}`).toBe(true);
        }
      }
    }
  });

  it("binds material facts to objects and preserves decision-driving numbers and entities", () => {
    const claim = intentGoldTurns.find(({id}) => id === "gc01-t03")!.expected.semantic.objects.find(({kind}) => kind === "claim")!;
    expect(claim.slots).toEqual(expect.arrayContaining([
      {key: "subject", allowedValues: ["alavancagem"], cardinality: 1},
      {key: "ratio", allowedValues: ["4.7"], cardinality: 1},
    ]));
    const structure = intentGoldTurns.find(({id}) => id === "gc03-t01")!.expected.semantic.objects;
    expect(structure.find(({kind}) => kind === "company")!.slots).toContainEqual({key: "entity", allowedValues: ["Aurora"], cardinality: 1});
    expect(structure.find(({kind}) => kind === "operation")!.slots).toEqual(expect.arrayContaining([
      {key: "subject", allowedValues: ["captação"], cardinality: 1},
      {key: "amount", allowedValues: ["50000000"], cardinality: 1},
      {key: "currency", allowedValues: ["BRL"], cardinality: 1},
    ]));
    expect(structure.find(({kind}) => kind === "asset_or_pool")!.slots).toContainEqual({key: "subject", allowedValues: ["recebíveis"], cardinality: 1});
    expect(intentGoldTurns.find(({id}) => id === "gc05-t03")!.expected.semantic.objects.find(({kind}) => kind === "scenario")!.slots)
      .toEqual(expect.arrayContaining([{key: "indexer", allowedValues: ["CDI"], cardinality: 1}, {key: "percentage", allowedValues: ["0.12"], cardinality: 1}, {key: "tenor_months", allowedValues: ["84"], cardinality: 1}]));
  });

  it("keeps an independent acceptance plan for document-backed structuring", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc03-t01")!;
    expect(turn.documentCount).toBe(2);
    expect(turn.expected.primaryWorks).toEqual(["extract_and_reconcile", "capital_strategy", "analyze"]);
  });

  it("defines exactly six stability triplets with three distinct authored messages", () => {
    expect(stabilityIntentTurnIds).toHaveLength(6);
    for (const id of stabilityIntentTurnIds) {
      const turn = intentGoldTurns.find((candidate) => candidate.id === id)!;
      expect(new Set([turn.message, ...turn.stabilityParaphrases!]).size).toBe(3);
    }
  });

  it("preserves authored conversation roles and carries continuity only in governed work context", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc01-t02")!;
    expect(intentGoldClassifierInput(turn, turn.message).recentConversation.map(({role}) => role)).toEqual(["user", "assistant"]);
    const objectInput = intentGoldObjectInput(turn, turn.message);
    expect(objectInput.recentConversation.map(({role}) => role)).toEqual(["user", "assistant"]);
    expect(objectInput.activeWorkContext).toMatchObject({
      organizationId: "10000000-0000-4000-8000-000000000001",
      projectId: "20000000-0000-4000-8000-000000000001",
      state: "active",
      objects: [{kind: "company"}, {kind: "operation"}],
    });
    expect(JSON.stringify(objectInput.activeWorkContext)).not.toContain("A análise inicial da Camil foi organizada.");
  });

  it("makes a continuity oracle realizable through current-turn triggers and governed objects", () => {
    const turn = intentGoldTurns.find(({id}) => id === "gc01-t02")!;
    const objectInput = intentGoldObjectInput(turn, turn.message);
    const pitchStart = turn.message.indexOf("pitch");
    const pagesStart = turn.message.indexOf("três páginas");
    const alternativesStart = turn.message.indexOf("alternativas");
    const span = (start: number, text: string) => ({source: "latest_user_message" as const, messageIndex: null, start, end: start + text.length, text});
    const compilation = compileSemanticObjects(objectInput, {
      objects: [
        {
          candidateId: "candidate-1", kind: "material",
          head: {key: "subject", span: span(pitchStart, "pitch")},
          modifiers: [{key: "page_count", span: span(pagesStart, "três páginas")}],
        },
        {
          candidateId: "candidate-2", kind: "alternative",
          head: {key: "subject", span: span(alternativesStart, "alternativas")}, modifiers: [],
        },
      ],
      activeContextReferences: [
        {contextObjectId: "context-1", trigger: span(pitchStart, "pitch")},
        {contextObjectId: "context-2", trigger: span(pitchStart, "pitch")},
      ],
      unresolvedReferences: [], excludedQuantitativeSpans: [], excludedSemanticHeadSpans: [],
    });
    expect(compilation.status).toBe("complete");
    expect(compilation.objects.map(({kind}) => kind)).toEqual(["material", "alternative", "company", "operation"]);
    expect(compilation.objects.slice(2).every(({source}) => source.type === "active_work_context")).toBe(true);
  });
});
