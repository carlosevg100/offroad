import {describe, expect, it} from "vitest";
import {MD_TEST_RUBRIC, referenceDataStatusSchema, structuringSituations} from "@offroad/credit-playbook";
import {capitalChartQuestionCodes, capitalMdTestScopeCodes, capitalMdTestStatuses} from "@offroad/financial-model";
import enUS from "../../../messages/en-US.json";
import ptBR from "../../../messages/pt-BR.json";
import {selectClientMessages} from "@/i18n/client-messages";
import type {ExecutionRequestError} from "./failure";
import type {WorkExecutionMdTest} from "./read";

/** Every code the action can return; the record type makes the compiler list them all. */
const requestErrors: Record<ExecutionRequestError, true> = {
  invalid: true, stale: true, denied: true, producer_denied: true, method_unavailable: true, basis_denied: true, provenance_denied: true, conflict: true, unavailable: true,
  gates_invalid: true, gates_blocked: true, gates_mismatch: true,
  company_unregistered: true, situation_required: true, situation_unknown: true, method_not_applicable: true, selection_invalid: true, voice_blocked: true,
};
const notEvaluated: Record<Extract<WorkExecutionMdTest, {evaluated: false}>["reason"], true> = {gates_not_recorded: true, gates_unverified: true, evaluation_failed: true};
const keys = (node: object) => Object.keys(node).sort();

describe("work executions catalogue", () => {
  it("labels the situations with the literal R3 text in pt-BR and the same ids in en-US", () => {
    expect(ptBR.App.workExecutions.situations).toEqual(Object.fromEntries(structuringSituations.map(situation => [situation.situationId, situation.label])));
    expect(keys(enUS.App.workExecutions.situations)).toEqual(keys(ptBR.App.workExecutions.situations));
    expect(Object.values(enUS.App.workExecutions.situations).every(label => label.trim().length > 0)).toBe(true);
  });
  it("carries the ten MD test questions as the literal Q1 text in pt-BR and the same ids in en-US", () => {
    expect(ptBR.App.workExecutions.mdTest.questions).toEqual(Object.fromEntries(MD_TEST_RUBRIC.map(question => [question.id, question.question])));
    expect(keys(enUS.App.workExecutions.mdTest.questions)).toEqual(keys(ptBR.App.workExecutions.mdTest.questions));
  });
  it.each([["pt-BR", ptBR], ["en-US", enUS]] as const)("%s translates every code the screens can show", (_locale, catalogue) => {
    const w = catalogue.App.workExecutions;
    expect(keys(w.errors)).toEqual(keys(requestErrors));
    expect(keys(w.mdTest.statuses)).toEqual([...capitalMdTestStatuses].sort());
    expect(keys(w.mdTest.scopeCodes)).toEqual([...capitalMdTestScopeCodes].sort());
    expect(keys(w.mdTest.notEvaluated)).toEqual(keys(notEvaluated));
    expect(keys(w.decisive.questions)).toEqual([...capitalChartQuestionCodes].sort());
    expect(keys(w.gates.conventionStatuses)).toEqual([...referenceDataStatusSchema.options].sort());
    expect(keys(w.gates.registrationStates)).toEqual(["missing", "registered"]);
    expect(keys(w.gates.researchStates)).toEqual(["abstained", "missing", "recorded"]);
  });
  it("hands the situation labels and the new refusals to the request form on the client", () => {
    for (const catalogue of [ptBR, enUS]) {
      const client = selectClientMessages(catalogue as typeof ptBR).App.workExecutions;
      expect(client.situations).toEqual(catalogue.App.workExecutions.situations);
      expect(keys(client.errors)).toEqual(keys(requestErrors));
      expect(client.request.situations.length).toBeGreaterThan(0);
    }
  });
});
