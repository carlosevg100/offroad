import {readFileSync, writeFileSync} from "node:fs";
import {describe, it} from "vitest";
import {compileObjectivePreflight} from "./agent-operation-brief";

/**
 * Deterministic trial harness (no model, no database). Runs the production preflight on each phrase of
 * an external trial file (cases with phrases and an attachment flag) and writes what the product would
 * decide: objective kind, entry job, terminal, targets, readiness, workflow recipe and dispatch candidate.
 * Skipped unless PREFLIGHT_TRIAL_INPUT and PREFLIGHT_TRIAL_OUTPUT point to files outside the repository.
 */
const input = process.env.PREFLIGHT_TRIAL_INPUT;
const output = process.env.PREFLIGHT_TRIAL_OUTPUT;

type TrialCase = {id: string; frases: {frase: string; anexo: boolean}[]};

describe.skipIf(!input || !output)("preflight trial without a model", () => {
  it("records the product decision for each phrase", () => {
    const cases: TrialCase[] = JSON.parse(readFileSync(input!, "utf8"));
    const resultados = cases.map((trialCase) => ({
      ...trialCase,
      frases: trialCase.frases.map(({frase, anexo}) => {
        const context = {
          message: frase,
          documents: anexo ? [{id: "00000000-0000-4000-8000-000000000001"}] : [],
          project: null,
        } as unknown as Parameters<typeof compileObjectivePreflight>[0];
        try {
          const r = compileObjectivePreflight(context);
          return {frase, anexo, decisao: {
            objectiveKind: r.objectivePlan.objectiveKind,
            entryJob: r.objectivePlan.entryJob,
            outputTerminal: r.objectivePlan.outputTerminal,
            targetTaskIds: r.objectivePlan.targetTaskIds,
            readiness: r.preflightDecision,
            workflowSelection: r.workflowSelection,
            dispatchCandidate: r.dispatchCandidate,
          }};
        } catch (error) {
          return {frase, anexo, erro: error instanceof Error ? error.message : String(error)};
        }
      }),
    }));
    writeFileSync(output!, JSON.stringify(resultados, null, 1));
  });
});
