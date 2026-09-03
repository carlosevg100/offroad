import {z} from "zod";

import {professionalFunctionGroupSchema} from "./professional-functions";
import {executableWorkspaceJobSchema, type ExecutableWorkspaceJob} from "./workspace-jobs";

const evidenceModeSchema = z.enum(["public", "private", "hybrid"]);

export const collaborativeAdvisoryPolicySchema = z.object({
  schemaVersion: z.literal("collaborative-advisory-policy.v1"),
  alternativeUniverse: z.literal("company_first_and_unconstrained"),
  professionalContextUse: z.literal("prioritize_and_shape_never_suppress"),
  evaluationLenses: z.tuple([
    z.literal("company_fit"),
    z.literal("market_feasibility"),
    z.literal("execution_path"),
  ]),
  prohibitedFraming: z.array(z.string().min(5)).min(1),
  collaborationClose: z.object({
    posture: z.literal("associate_or_vp_to_md"),
    question: z.string().min(10),
    choices: z.tuple([
      z.literal("deepen_one"),
      z.literal("combine_alternatives"),
      z.literal("develop_all_for_comparison"),
      z.literal("add_context_and_reassess"),
    ]),
  }),
});
export type CollaborativeAdvisoryPolicy = z.infer<typeof collaborativeAdvisoryPolicySchema>;

export const collaborativeAdvisoryPolicy = collaborativeAdvisoryPolicySchema.parse({
  schemaVersion: "collaborative-advisory-policy.v1",
  alternativeUniverse: "company_first_and_unconstrained",
  professionalContextUse: "prioritize_and_shape_never_suppress",
  evaluationLenses: ["company_fit", "market_feasibility", "execution_path"],
  prohibitedFraming: [
    "Do not describe the user's declared capabilities as the boundary of the strategic analysis.",
    "Do not tell the user which alternatives their institution can or cannot lead unless they explicitly ask.",
    "Do not collapse company fit, market feasibility and execution path into one opaque score.",
  ],
  collaborationClose: {
    posture: "associate_or_vp_to_md",
    question: "Which of these paths makes the most sense to pursue from here?",
    choices: ["deepen_one", "combine_alternatives", "develop_all_for_comparison", "add_context_and_reassess"],
  },
});

export const workspaceJourneyBlueprintSchema = z.object({
  schemaVersion: z.literal("workspace-journey-blueprint.v1"),
  id: executableWorkspaceJobSchema,
  typicalUsers: z.array(professionalFunctionGroupSchema).min(1),
  acceptedEvidenceModes: z.array(evidenceModeSchema).min(1),
  entryUnderstanding: z.string().min(20),
  contextBeforeWork: z.array(z.string().min(5)).max(5),
  workThatCanRunInParallel: z.array(z.string().min(5)).min(1),
  analyticalCore: z.array(z.string().min(5)).min(2),
  firstWorkProduct: z.string().min(5),
  nextWorkProducts: z.array(z.string().min(5)).min(1),
  interactionRule: z.string().min(20),
});
export type WorkspaceJourneyBlueprint = z.infer<typeof workspaceJourneyBlueprintSchema>;

const journeyBlueprints: Record<ExecutableWorkspaceJob, WorkspaceJourneyBlueprint> = {
  company_debt_view: {
    schemaVersion: "workspace-journey-blueprint.v1",
    id: "company_debt_view",
    typicalUsers: ["company_leadership", "company_finance", "banker_or_dcm", "structured_finance", "advisor", "credit_analysis", "risk_and_underwriting", "investor_or_lender"],
    acceptedEvidenceModes: ["public", "private", "hybrid"],
    entryUnderstanding: "Understand a company, its financial position and capital structure before assuming a transaction.",
    contextBeforeWork: ["company identity", "the decision or discussion this analysis should inform"],
    workThatCanRunInParallel: ["resolve existing company memory", "inventory supplied documents", "refresh public company and market sources"],
    analyticalCore: ["business and sector", "financial performance and cash conversion", "debt, liquidity and capital structure", "risks, constraints and opportunities"],
    firstWorkProduct: "source-grounded company diagnostic through a debt-capital-markets lens",
    nextWorkProducts: ["capital alternatives", "meeting thesis", "focused information request"],
    interactionRule: "Present the integrated read, disclose material unknowns and let the user choose which question or alternative to develop next.",
  },
  origination_thesis: {
    schemaVersion: "workspace-journey-blueprint.v1",
    id: "origination_thesis",
    typicalUsers: ["banker_or_dcm", "structured_finance", "syndicate_distribution", "advisor", "credit_analysis"],
    acceptedEvidenceModes: ["public", "hybrid"],
    entryUnderstanding: "Prepare a company-specific point of view and strategic capital alternatives for a real conversation.",
    contextBeforeWork: ["company identity", "audience", "desired outcome", "relationship context"],
    workThatCanRunInParallel: ["recover authorized history", "refresh public company intelligence", "research sector, events and debt-market precedents"],
    analyticalCore: ["company and performance", "debt stack and liquidity", "corporate agenda", "strategic alternatives", "meeting narrative"],
    firstWorkProduct: "senior-banker readout with alternatives and decision-useful questions",
    nextWorkProducts: ["deep dive on a selected path", "comparison of combined paths", "pitch structure and materials"],
    interactionRule: "Do the associate or VP work first, then ask the user which path to pursue, combine or carry into the material.",
  },
  capital_planning: {
    schemaVersion: "workspace-journey-blueprint.v1",
    id: "capital_planning",
    typicalUsers: ["company_leadership", "company_finance", "banker_or_dcm", "structured_finance", "advisor", "credit_analysis", "risk_and_underwriting"],
    acceptedEvidenceModes: ["public", "private", "hybrid"],
    entryUnderstanding: "Translate a capital question, balance-sheet objective or corporate plan into comparable financing strategies.",
    contextBeforeWork: ["company identity", "economic objective", "known timing or constraints when material"],
    workThatCanRunInParallel: ["recover company context", "inventory available evidence", "research company, sector and current market"],
    analyticalCore: ["sources and uses", "capacity and source of repayment", "capital-structure impact", "alternative families and execution conditions"],
    firstWorkProduct: "directional map of capital alternatives and the evidence that would change their ranking",
    nextWorkProducts: ["reconciled financial diagnostic", "scenario comparison", "indicative structure"],
    interactionRule: "Compare the relevant universe first and invite the user to select, combine or refine paths before structuring terms.",
  },
  structure_from_documents: {
    schemaVersion: "workspace-journey-blueprint.v1",
    id: "structure_from_documents",
    typicalUsers: ["company_leadership", "company_finance", "banker_or_dcm", "structured_finance", "advisor", "credit_analysis", "risk_and_underwriting", "investor_or_lender"],
    acceptedEvidenceModes: ["private", "hybrid"],
    entryUnderstanding: "Read the material already available, infer the financing problem and develop structures without making the user repeat it.",
    contextBeforeWork: ["right to use the information", "decision or outcome the work should support when it cannot be inferred"],
    workThatCanRunInParallel: ["classify and extract every document", "resolve duplicates and periods", "refresh non-confidential public context"],
    analyticalCore: ["evidence coverage", "financial reconciliation", "capital need and capacity", "structure alternatives and sensitivities"],
    firstWorkProduct: "preliminary understanding plus a short material information gap request",
    nextWorkProducts: ["validated case", "alternative structures", "indicative term sheet and model"],
    interactionRule: "Read before asking, request only the smallest evidence batch that changes a material decision and build the structure jointly.",
  },
  review_existing_operation: {
    schemaVersion: "workspace-journey-blueprint.v1",
    id: "review_existing_operation",
    typicalUsers: ["company_leadership", "company_finance", "banker_or_dcm", "structured_finance", "advisor", "credit_analysis", "risk_and_underwriting", "investor_or_lender", "legal_and_execution"],
    acceptedEvidenceModes: ["private", "hybrid"],
    entryUnderstanding: "Reconstruct an existing proposal or term sheet, test its economics and protections, and compare credible improvements.",
    contextBeforeWork: ["document or terms to review", "which side and decision the review should inform"],
    workThatCanRunInParallel: ["extract terms and conditions", "reconcile them with company evidence", "research comparable market structures"],
    analyticalCore: ["economics", "amortization and refinancing risk", "covenants and collateral", "flexibility, downside and alternatives"],
    firstWorkProduct: "traceable issue map separating facts, calculations, judgments and open points",
    nextWorkProducts: ["revised structure", "negotiation positions", "redline or comparison material"],
    interactionRule: "Explain what works, what does not and what could be improved, then let the user choose which points to negotiate or redesign.",
  },
  prepare_materials_and_process: {
    schemaVersion: "workspace-journey-blueprint.v1",
    id: "prepare_materials_and_process",
    typicalUsers: ["company_leadership", "company_finance", "banker_or_dcm", "structured_finance", "syndicate_distribution", "advisor", "credit_analysis", "risk_and_underwriting", "investor_or_lender", "legal_and_execution"],
    acceptedEvidenceModes: ["private", "hybrid"],
    entryUnderstanding: "Turn an agreed analytical direction into consistent decision or market materials without rebuilding the case.",
    contextBeforeWork: ["approved analytical snapshot", "audience and purpose of the material"],
    workThatCanRunInParallel: ["compile the latest company truth", "resolve material-specific evidence gaps", "apply approved templates and language"],
    analyticalCore: ["narrative consistency", "financial and structural consistency", "evidence coverage", "audience suitability"],
    firstWorkProduct: "reviewable material compiled from the governed project snapshot",
    nextWorkProducts: ["revisions", "capital-provider matching", "qualified introduction after exact authorization"],
    interactionRule: "Present a reviewable version, preserve user control over revisions and never contact a third party without exact authorization.",
  },
};

export function workspaceJourneyBlueprint(job: ExecutableWorkspaceJob): WorkspaceJourneyBlueprint {
  return workspaceJourneyBlueprintSchema.parse(journeyBlueprints[job]);
}

export function allWorkspaceJourneyBlueprints(): WorkspaceJourneyBlueprint[] {
  return executableWorkspaceJobSchema.options.map((job) => workspaceJourneyBlueprint(job));
}
