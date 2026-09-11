import {describe, expect, it} from "vitest";

import {
  classifyProjectWorkObjective,
  dispatchProjectWork,
  isDebtStructureRequest,
  isFinancialResultRequest,
  projectCapability,
  projectCapabilityRegistry,
  projectWorkContextSchema,
  reviewActionAllowedByRoles,
  type ProjectWorkContext,
} from "./project-capability-registry";
import {canCompileStandaloneDocumentWorkRequest} from "./document-work-request";

const ready: ProjectWorkContext = {
  accessBasis: "authorized_private",
  documentaryPlanningEnabled: true,
  readyDocumentCount: 2,
  executionBriefAvailable: true,
  institutionalSetupAvailable: true,
  providerCaseFitAvailable: true,
  acceptedDebtFactCount: 18,
  callerActions: {prepare: true, return: true, approve: true},
};

describe("project capability registry", () => {
  it("lists only executors that exist, each with an approval gate, inputs and deliverable types", () => {
    expect(projectCapabilityRegistry.map((entry) => entry.id)).toEqual(["documentary_reading", "financial_result", "provider_research", "debt_structure_analysis"]);
    for (const entry of projectCapabilityRegistry) {
      expect(entry.executor.command).toMatch(/_v1$/);
      expect(entry.inputs.length).toBeGreaterThan(0);
      expect(entry.deliverableTypes.length).toBeGreaterThan(0);
      expect(entry.approval.separationOfDuties).toBe("project_review_roles");
      expect(entry.limits.length).toBeGreaterThan(0);
      expect(entry.onMissingData.nextStep.pt.length).toBeGreaterThan(0);
      expect(entry.onUnsupported.nextStep.en.length).toBeGreaterThan(0);
      for (const text of [entry.summary, entry.expectedResult, ...entry.plan, ...entry.limits]) {
        expect(`${text.pt}${text.en}`).not.toMatch(/—/);
      }
    }
    expect(projectCapability("financial_result").deliverableTypes).toEqual(["financial_model", "financial_memo", "executive_presentation"]);
    expect(projectCapability("debt_structure_analysis").deliverableTypes).toEqual(["debt_structure_reading", "financial_memo"]);
    // The debt capability names the exact house methods it executes; credit-playbook pins the list
    // against the methods that actually reached production.
    expect(projectCapability("debt_structure_analysis").methods?.map((method) => method.id)).toEqual([
      "build-debt-ledger", "build-interest-and-indexation-schedule", "reconcile-covenant-definitions",
      "reconcile-financial-statements", "compare-refinancing-before-after", "diagnose-maturity-wall",
      "estimate-exit-cost-by-series",
    ]);
  });

  it("never encodes a commercial profile as authorization", () => {
    const serialized = JSON.stringify(projectCapabilityRegistry);
    expect(serialized).not.toMatch(/cfo|banker|investor|professionalRole/i);
    expect(projectWorkContextSchema.safeParse({...ready, professionalRole: "cfo"}).success).toBe(false);
  });

  it("routes qualitative documentary requests to the documentary executor and calculations to the financial one", () => {
    expect(classifyProjectWorkObjective("Compare estas propostas de financiamento e destaque os pontos a esclarecer.")).toMatchObject({capability: "documentary_reading", documentaryJob: "comparison"});
    expect(classifyProjectWorkObjective("Prepare a reunião com esta companhia usando os documentos enviados.")).toMatchObject({capability: "documentary_reading", documentaryJob: "meeting"});
    const calculation = "Compare estas propostas e calcule o custo efetivo de cada uma.";
    expect(canCompileStandaloneDocumentWorkRequest({objective: calculation, proposedDeliverable: "Preliminary documentary reading"})).toBe(false);
    expect(classifyProjectWorkObjective(calculation)).toMatchObject({capability: "financial_result", reason: "calculation_in_documentary_scope"});
    expect(classifyProjectWorkObjective("Calcule os cenários de serviço da dívida para 2027.")).toMatchObject({capability: "financial_result", reason: "financial"});
    // Named debt-structure work goes to the promoted house methods, never to the model.
    expect(classifyProjectWorkObjective("Monte o ledger de dívida da companhia a partir das notas.")).toMatchObject({capability: "debt_structure_analysis", reason: "debt_structure"});
    expect(classifyProjectWorkObjective("Concilie as definições de covenant das escrituras.")).toMatchObject({capability: "debt_structure_analysis", reason: "debt_structure"});
    expect(classifyProjectWorkObjective("Build the maturity wall and the exit cost per series.")).toMatchObject({capability: "debt_structure_analysis", reason: "debt_structure"});
    expect(isDebtStructureRequest("Calcule os cenários de serviço da dívida para 2027.")).toBe(false);
    expect(isDebtStructureRequest("Faça a comparação financeira dos cenários de refinanciamento.")).toBe(false);
    expect(classifyProjectWorkObjective("Pesquise os financiadores e mandatos disponíveis para este caso.")).toMatchObject({capability: "provider_research"});
    expect(classifyProjectWorkObjective("Bom dia, tudo bem?")).toMatchObject({capability: null, reason: "unrecognized"});
    expect(isFinancialResultRequest("Build the financial comparison of the two scenarios")).toBe(true);
  });

  it("dispatches each acceptance case to the matching executor with the inputs it still needs", () => {
    const company = dispatchProjectWork({objective: "Faça a comparação financeira dos cenários de refinanciamento.", capability: "auto"}, ready);
    expect(company).toMatchObject({kind: "dispatch", capability: "financial_result", surface: "institutional-setup", pendingInputs: ["declared_assumptions", "reference_date"]});
    const advisor = dispatchProjectWork({objective: "Prepare a reunião com a companhia a partir dos documentos.", capability: "auto"}, ready);
    expect(advisor).toMatchObject({kind: "dispatch", capability: "documentary_reading", documentaryJob: "meeting", surface: "document-review"});
    const analyst = dispatchProjectWork({objective: "Pesquise financiadores e mandatos para este caso.", capability: "auto"}, ready);
    expect(analyst).toMatchObject({kind: "dispatch", capability: "provider_research", surface: "provider-case-criteria", pendingInputs: ["case_criteria", "reference_date"]});
    const routed = dispatchProjectWork({objective: "Compare estas propostas e calcule o custo efetivo.", capability: "auto"}, ready);
    expect(routed).toMatchObject({kind: "dispatch", capability: "financial_result", note: "calculation_routed_to_financial"});
    const debt = dispatchProjectWork({objective: "Monte o ledger de dívida e a parede de vencimentos.", capability: "auto"}, ready);
    expect(debt).toMatchObject({kind: "dispatch", capability: "debt_structure_analysis", surface: "debt-structure", pendingInputs: ["reference_date"]});
    const picked = dispatchProjectWork({objective: "Preciso da posição de dívida instrumento a instrumento.", capability: "debt_structure_analysis"}, ready);
    expect(picked).toMatchObject({kind: "dispatch", capability: "debt_structure_analysis", surface: "debt-structure"});
  });

  it("blocks the debt structure on the facts it needs, never on an organization allowlist", () => {
    const noFacts = dispatchProjectWork({objective: "Monte o ledger de dívida.", capability: "auto"}, {...ready, acceptedDebtFactCount: 0});
    expect(noFacts).toMatchObject({kind: "blocked", capability: "debt_structure_analysis", reason: "missing_inputs", missingInputs: ["accepted_debt_facts"]});
    const publicProject = dispatchProjectWork({objective: "Monte o ledger de dívida.", capability: "debt_structure_analysis"}, {...ready, accessBasis: "public_information", readyDocumentCount: 0, acceptedDebtFactCount: 0});
    expect(publicProject).toMatchObject({kind: "blocked", reason: "missing_inputs", missingInputs: ["private_access", "ready_documents", "accepted_debt_facts"]});
    const readOnly = dispatchProjectWork({objective: "Monte o ledger de dívida.", capability: "debt_structure_analysis"}, {...ready, callerActions: {prepare: false, return: false, approve: false}});
    expect(readOnly).toMatchObject({kind: "blocked", reason: "not_authorized"});
    // Documentary activation gates the documentary reading only; the debt structure is not behind it.
    const inactive = dispatchProjectWork({objective: "Monte o ledger de dívida.", capability: "debt_structure_analysis"}, {...ready, documentaryPlanningEnabled: false});
    expect(inactive).toMatchObject({kind: "dispatch", capability: "debt_structure_analysis"});
    // An explicit pick is the person's decision and is honoured, as it is for the other capabilities;
    // only the documentary reading refuses an objective outside its own scope, because it must.
    const explicit = dispatchProjectWork({objective: "Pesquise financiadores para o caso.", capability: "debt_structure_analysis"}, ready);
    expect(explicit).toMatchObject({kind: "dispatch", capability: "debt_structure_analysis"});
  });

  it("refuses calculations inside an explicitly documentary request instead of executing them", () => {
    const result = dispatchProjectWork({objective: "Compare estas propostas e calcule o DSCR.", capability: "documentary_reading"}, ready);
    expect(result).toMatchObject({kind: "unsupported", reason: "calculation_in_documentary_scope", suggestedCapability: "financial_result"});
    const vague = dispatchProjectWork({objective: "Faça algo com estes arquivos.", capability: "documentary_reading"}, ready);
    expect(vague).toMatchObject({kind: "unsupported", reason: "documentary_job_unrecognized"});
    const unknown = dispatchProjectWork({objective: "Obrigado pelo apoio de ontem.", capability: "auto"}, ready);
    expect(unknown).toMatchObject({kind: "unsupported", reason: "unrecognized_objective", suggestedCapability: null});
    expect(unknown.kind === "unsupported" && unknown.nextStep.pt.length > 0).toBe(true);
  });

  it("explains missing data, missing activation and missing authority without widening access", () => {
    const inactive = dispatchProjectWork({objective: "Compare estas propostas.", capability: "auto"}, {...ready, documentaryPlanningEnabled: false});
    expect(inactive).toMatchObject({kind: "blocked", reason: "documentary_not_activated", missingInputs: ["documentary_activation"]});
    const publicProject = dispatchProjectWork({objective: "Compare estas propostas.", capability: "auto"}, {...ready, accessBasis: "public_information", readyDocumentCount: 0});
    expect(publicProject).toMatchObject({kind: "blocked", reason: "missing_inputs", missingInputs: ["private_access", "ready_documents"]});
    const noFacts = dispatchProjectWork({objective: "Calcule os cenários.", capability: "financial_result"}, {...ready, institutionalSetupAvailable: false});
    expect(noFacts).toMatchObject({kind: "blocked", reason: "missing_inputs", missingInputs: ["reconciled_facts"]});
    const readOnly = dispatchProjectWork({objective: "Calcule os cenários.", capability: "financial_result"}, {...ready, callerActions: {prepare: false, return: false, approve: false}});
    expect(readOnly).toMatchObject({kind: "blocked", reason: "not_authorized"});
    const noPlan = dispatchProjectWork({objective: "Pesquise financiadores para o caso.", capability: "provider_research"}, {...ready, executionBriefAvailable: false});
    expect(noPlan).toMatchObject({kind: "blocked", reason: "missing_inputs", missingInputs: ["execution_brief"]});
  });

  it("mirrors the database role policy: open projects stay permissive, assigned projects require the role", () => {
    expect(reviewActionAllowedByRoles("approve", [], {mode: "open", selfApprovalAllowed: false, callerIsPreparer: true})).toBe(true);
    expect(reviewActionAllowedByRoles("approve", ["reviewer"], {mode: "assigned", selfApprovalAllowed: true, callerIsPreparer: false})).toBe(false);
    expect(reviewActionAllowedByRoles("return", ["reviewer"], {mode: "assigned", selfApprovalAllowed: false, callerIsPreparer: false})).toBe(true);
    expect(reviewActionAllowedByRoles("prepare", ["approver"], {mode: "assigned", selfApprovalAllowed: false, callerIsPreparer: false})).toBe(false);
    expect(reviewActionAllowedByRoles("approve", ["preparer", "approver"], {mode: "assigned", selfApprovalAllowed: false, callerIsPreparer: true})).toBe(false);
    expect(reviewActionAllowedByRoles("approve", ["preparer", "approver"], {mode: "assigned", selfApprovalAllowed: true, callerIsPreparer: true})).toBe(true);
    expect(reviewActionAllowedByRoles("approve", ["approver"], {mode: "assigned", selfApprovalAllowed: false, callerIsPreparer: false})).toBe(true);
  });
});
