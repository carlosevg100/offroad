import {fingerprintJson} from "@offroad/case-understanding";
import {z} from "zod";

export const goldJourneyIdSchema = z.enum(["G1", "G2", "G3", "G4", "G5", "G6", "G7", "G8"]);
export type GoldJourneyId = z.infer<typeof goldJourneyIdSchema>;

export const journeySurfaceSchema = z.enum([
  "conversation", "alignment", "execution_brief", "live_work", "workbench", "artifact_review",
  "decision_checkpoint", "capital_workspace", "continuation",
]);
export type JourneySurface = z.infer<typeof journeySurfaceSchema>;

export const journeyGateIdSchema = z.enum([
  "identity", "evidence", "extraction", "reconciliation", "completeness", "model", "debt",
  "judgment", "structure", "market", "materials", "interaction", "security", "survival",
]);
export type JourneyGateId = z.infer<typeof journeyGateIdSchema>;

export const journeyStageSchema = z.object({
  stageId: z.string().regex(/^G[1-8]-S[0-9]{2}$/),
  title: z.string().min(1),
  surface: journeySurfaceSchema,
  userOutcome: z.string().min(1),
  requiredObjects: z.array(z.string().min(1)).min(1),
  requiredOutputs: z.array(z.string().min(1)).min(1),
  requiredEvidence: z.array(z.string().min(1)).min(1),
  questionPolicy: z.enum(["none", "only_if_material", "checkpoint_choice", "exact_authorization"]),
  nextStageIds: z.array(z.string().regex(/^G[1-8]-S[0-9]{2}$/)),
  terminal: z.boolean(),
});
export type JourneyStage = z.infer<typeof journeyStageSchema>;

export const journeyGateRequirementSchema = z.object({
  gateId: journeyGateIdSchema,
  applicability: z.enum(["required", "conditional", "not_applicable"]),
  criterion: z.string().min(1),
});
export type JourneyGateRequirement = z.infer<typeof journeyGateRequirementSchema>;

export const longitudinalJourneyContractSchema = z.object({
  journeyId: goldJourneyIdSchema,
  version: z.string().min(1),
  title: z.string().min(1),
  objective: z.string().min(1),
  primaryIntentFamilies: z.array(z.string().regex(/^I[0-9]{2}$/)).min(1),
  status: z.enum(["specified", "reference_ready", "executable", "production"]),
  stages: z.array(journeyStageSchema).min(5),
  variants: z.object({
    languages: z.array(z.enum(["pt-BR", "en-US"])).min(2),
    responsibilities: z.array(z.string().min(1)).min(2),
    evidenceRegimes: z.array(z.enum(["public", "private", "mixed"])).min(2),
    dataAvailability: z.array(z.enum(["complete", "partial", "minimal"])).min(2),
    terminalOutcomes: z.array(z.string().min(1)).min(2),
  }),
  gateRequirements: z.array(journeyGateRequirementSchema).length(14),
  trustAdversarials: z.array(z.string().min(1)).min(4),
  forbiddenBehaviors: z.array(z.string().min(1)).min(5),
});
export type LongitudinalJourneyContract = z.infer<typeof longitudinalJourneyContractSchema>;

export const journeyCatalogueDecisionSchema = z.object({
  valid: z.boolean(),
  journeyCount: z.number().int().nonnegative(),
  blockers: z.array(z.string().min(1)),
  warnings: z.array(z.string().min(1)),
  catalogueFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
});
export type JourneyCatalogueDecision = z.infer<typeof journeyCatalogueDecisionSchema>;

const universalGateCriteria: Record<JourneyGateId, string> = {
  identity: "Entity, object, date, currency and consolidation perimeter are correct or explicitly not applicable.",
  evidence: "Every material claim is source-bound and public, private, inferred and modelled information remain separated.",
  extraction: "Critical fields meet the journey-specific precision and recall threshold or remain visibly missing.",
  reconciliation: "Relevant statements, debt, contracts, sources and outputs reconcile or expose the divergence.",
  completeness: "Every required dimension is covered, marked missing with impact, or explicitly not applicable.",
  model: "Required calculations and scenarios are deterministic, governed and reproducible.",
  debt: "Applicable balance, indexation, interest, amortization, fees, guarantees and covenants reproduce the evidence.",
  judgment: "Alternatives, trade-offs, downside, uncertainty and disconfirming evidence are visible.",
  structure: "Indicative terms are internally coherent, complete for the stage and bounded by execution reality.",
  market: "Market evidence and provider fit are current, discriminated and never fabricated.",
  materials: "Conversation, model and artifacts share the same signed economic objects and pass visual QA.",
  interaction: "Questions are few, material, contextual and answers update the existing work rather than restart it.",
  security: "Tenant, provider, export, disclosure and effect boundaries pass the journey adversarials.",
  survival: "The journey documents a decision, error, structure, time or execution improvement over a general model.",
};

function gates(conditional: JourneyGateId[] = []): JourneyGateRequirement[] {
  return journeyGateIdSchema.options.map((gateId) => ({
    gateId,
    applicability: conditional.includes(gateId) ? "conditional" : "required",
    criterion: universalGateCriteria[gateId],
  }));
}

const sharedVariants: LongitudinalJourneyContract["variants"] = {
  languages: ["pt-BR", "en-US"],
  responsibilities: ["prepare", "review", "decide", "approve"],
  evidenceRegimes: ["public", "private", "mixed"],
  dataAvailability: ["complete", "partial", "minimal"],
  terminalOutcomes: ["continue", "pause_for_information", "abstain", "branch_to_next_work"],
};

const sharedAdversarials = [
  "Cross-tenant object or retrieval attempt",
  "Indirect prompt injection in a document or public source",
  "Provider failure that must not downgrade data policy",
  "Unauthorized export, disclosure or external effect",
];

const sharedForbidden = [
  "Route by job title instead of current intent and responsibility",
  "Invent missing facts, terms, mandates or evidence",
  "Start substantive work before the intent-specific Execution Brief is visible",
  "Present a recommendation as the user or institution decision",
  "Expose private reasoning, internal agent names or runtime language",
  "Rebuild the project from zero when a bounded dependency changed",
];

function stage(
  journeyId: GoldJourneyId,
  index: number,
  title: string,
  surface: JourneySurface,
  userOutcome: string,
  requiredObjects: string[],
  requiredOutputs: string[],
  requiredEvidence: string[],
  questionPolicy: JourneyStage["questionPolicy"],
  next: number[] = [],
  terminal = false,
): JourneyStage {
  return {
    stageId: `${journeyId}-S${String(index).padStart(2, "0")}`,
    title,
    surface,
    userOutcome,
    requiredObjects,
    requiredOutputs,
    requiredEvidence,
    questionPolicy,
    nextStageIds: next.map((value) => `${journeyId}-S${String(value).padStart(2, "0")}`),
    terminal,
  };
}

export const longitudinalGoldJourneys: LongitudinalJourneyContract[] = [
  {
    journeyId: "G1", version: "2026.09.06-v1", title: "Banker: ambiguous idea to material and continuation",
    objective: "Turn a vague senior instruction into a decision-useful meeting thesis, editable material and a persistent branch after the meeting.",
    primaryIntentFamilies: ["I01", "I03", "I06", "I08", "I11", "I12", "I20"], status: "specified",
    variants: sharedVariants, gateRequirements: gates(["market"]), trustAdversarials: sharedAdversarials,
    forbiddenBehaviors: sharedForbidden,
    stages: [
      stage("G1", 1, "Resolve request and current responsibility", "conversation", "See what was understood and what remains materially ambiguous.", ["intent_envelope", "project_context"], ["request_readback", "material_ambiguities"], ["user_request", "available_project_memory"], "only_if_material", [2]),
      stage("G1", 2, "Align only decision-changing points", "alignment", "Answer a short set of questions for the VP or set explicit working assumptions.", ["decision_context", "audience", "constraints"], ["alignment_card", "assumption_path"], ["user_answers", "declared_assumptions"], "only_if_material", [3]),
      stage("G1", 3, "Approve the meeting-specific work plan", "execution_brief", "Review sources, company and sector work, forecast, capital structure analysis, alternatives and intended deliverables before research begins.", ["execution_brief", "coverage_map"], ["RI/CVM/source plan", "company and sector study plan", "forecast and capital-structure plan", "meeting deliverables"], ["compiled_task_graph", "capability_ledger"], "checkpoint_choice", [4]),
      stage("G1", 4, "Build company and market truth", "live_work", "Follow real progress through company, sector, financial, debt and market evidence.", ["company_truth", "market_context", "source_manifest"], ["verified_facts", "source_gaps", "material_discoveries"], ["public_sources", "private_sources_if_authorized"], "none", [5]),
      stage("G1", 5, "Build prospective credit view", "workbench", "Inspect drivers, assumptions, forecast, debt service, liquidity and sensitivities.", ["financial_model", "debt_ledger", "scenario_set"], ["base_case", "downside_case", "traceable_metrics"], ["reconciled_truth", "governed_assumptions"], "only_if_material", [6]),
      stage("G1", 6, "Compare strategic alternatives", "workbench", "See company-optimal alternatives and institution-relevant paths without premature product bias.", ["alternative_set", "structure_hypotheses"], ["ranked_alternatives", "trade_offs", "execution_complexities"], ["model_outputs", "market_context"], "checkpoint_choice", [7]),
      stage("G1", 7, "Prepare and review meeting material", "artifact_review", "Review a template-faithful pitch and linked model before use.", ["meeting_brief", "presentation", "model"], ["editable_pitch", "editable_model", "artifact_QA"], ["signed_economic_snapshot", "client_template"], "checkpoint_choice", [8]),
      stage("G1", 8, "Apply a premise change", "workbench", "Change one premise and see only affected analyses and slides update.", ["premise", "dependency_graph", "artifact_versions"], ["scenario_diff", "localized_artifact_diff"], ["user_change", "prior_snapshot"], "none", [9]),
      stage("G1", 9, "Capture meeting outcome", "continuation", "Record feedback, objections and next decision without losing the prior work.", ["meeting_outcome", "decision_log"], ["outcome_summary", "next_options"], ["user_feedback", "approved_material_version"], "checkpoint_choice", [10]),
      stage("G1", 10, "Branch to structuring or close", "continuation", "Continue into a selected structure or close the work with rationale.", ["selected_alternative", "next_work_order"], ["structuring_branch_or_close_record"], ["recorded_user_decision"], "checkpoint_choice", [], true),
    ],
  },
  {
    journeyId: "G2", version: "2026.09.06-v1", title: "CFO: board question to execution preparation",
    objective: "Support a company decision from capital-structure diagnosis through board material and preparatory transaction work without taking the decision.",
    primaryIntentFamilies: ["I06", "I07", "I08", "I12", "I14", "I20"], status: "specified",
    variants: sharedVariants, gateRequirements: gates(["market"]), trustAdversarials: sharedAdversarials,
    forbiddenBehaviors: sharedForbidden,
    stages: [
      stage("G2", 1, "Resolve board decision", "conversation", "Confirm the decision, time horizon, audience and existing management information.", ["intent_envelope", "decision_context"], ["decision_readback", "material_unknowns"], ["user_request", "project_memory"], "only_if_material", [2]),
      stage("G2", 2, "Align management assumptions", "alignment", "Provide budget and constraints or authorize explicit public-information scenarios.", ["management_plan", "constraints"], ["alignment_card", "scenario_authority"], ["management_inputs_or_declared_substitutes"], "only_if_material", [3]),
      stage("G2", 3, "Approve the board-specific work plan", "execution_brief", "Review the exact plan for current and prospective capital structure, liquidity, maturities, cash return, downside, options and board paper.", ["execution_brief", "coverage_map"], ["management-information plan", "forecast plan", "capital-structure diagnostic plan", "board-paper plan"], ["compiled_task_graph", "capability_ledger"], "checkpoint_choice", [4]),
      stage("G2", 4, "Reconcile current position", "live_work", "See financial, debt, cash, covenant and liquidity evidence reconcile or remain visibly open.", ["company_truth", "debt_ledger", "covenant_set"], ["current_position", "exceptions", "information_request"], ["public_and_private_evidence"], "only_if_material", [5]),
      stage("G2", 5, "Build prospective position", "workbench", "Inspect driver-based forecast, funding needs, debt service and downside.", ["financial_model", "scenario_set"], ["prospective_metrics", "liquidity_path", "headroom"], ["management_plan", "market_assumptions"], "only_if_material", [6]),
      stage("G2", 6, "Compare board options", "decision_checkpoint", "Compare do-nothing and actionable alternatives with benefits, costs, conditions and risks.", ["alternative_set", "decision_matrix"], ["board_options", "recommendation_with_uncertainty"], ["model_outputs", "execution_evidence"], "checkpoint_choice", [7]),
      stage("G2", 7, "Prepare board paper", "artifact_review", "Review an editable board paper and supporting model tied to the same objects.", ["board_paper", "model"], ["editable_board_paper", "appendices", "artifact_QA"], ["signed_economic_snapshot"], "checkpoint_choice", [8]),
      stage("G2", 8, "Record company decision", "decision_checkpoint", "Record selected path, conditions, rejected alternatives and authority.", ["company_decision", "decision_log"], ["decision_record", "conditions_precedent"], ["authorized_user_decision"], "checkpoint_choice", [9]),
      stage("G2", 9, "Prepare selected transaction", "workbench", "Define information plan, indicative structure, timeline, execution risks and materials.", ["information_plan", "indicative_structure", "execution_plan"], ["data_request", "term_outline", "preparatory_materials"], ["recorded_decision", "updated_evidence"], "only_if_material", [10]),
      stage("G2", 10, "Map capital or continue internally", "continuation", "Choose whether to continue analysis, prepare a market map or stop.", ["capital_map_request", "next_work_order"], ["authorized_next_branch"], ["company_authority"], "checkpoint_choice", [], true),
    ],
  },
  {
    journeyId: "G3", version: "2026.09.06-v1", title: "Advisor: private documents and receivables",
    objective: "Convert fragmented private evidence into a reconciled receivables case, information request, indicative structure, material and explainable matching.",
    primaryIntentFamilies: ["I02", "I03", "I05", "I09", "I12", "I17"], status: "specified",
    variants: sharedVariants, gateRequirements: gates(), trustAdversarials: sharedAdversarials,
    forbiddenBehaviors: sharedForbidden,
    stages: [
      stage("G3", 1, "Inventory private evidence", "conversation", "See what arrived, what each file appears to contain and what is unusable.", ["document_inventory", "intent_envelope"], ["file_inventory", "initial_gaps"], ["authorized_private_documents"], "only_if_material", [2]),
      stage("G3", 2, "Approve receivables work plan", "execution_brief", "Review the plan for statements, tape, aging, eligibility, dilution, concentration, waterfall, gaps, structure, teaser and matching.", ["execution_brief", "coverage_map"], ["reconciliation plan", "receivables analysis plan", "structure and material plan", "capital-screen plan"], ["compiled_task_graph"], "checkpoint_choice", [3]),
      stage("G3", 3, "Reconcile company and tape", "live_work", "Follow financial and receivables evidence through reconciliation and exception detection.", ["company_truth", "receivables_tape", "exception_ledger"], ["reconciled_base", "data_quality_findings"], ["financials", "tape", "contracts"], "only_if_material", [4]),
      stage("G3", 4, "Test pool and structure capacity", "workbench", "Inspect eligibility, concentration, dilution, defaults, overcollateralization, cash flow and downside.", ["eligible_pool", "waterfall", "scenario_set"], ["borrowing_base", "loss_and_timing_sensitivities"], ["reconciled_tape", "governed_rules"], "only_if_material", [5]),
      stage("G3", 5, "Close material information gaps", "alignment", "Send a prioritized request showing why each missing item changes structure or investor fit.", ["coverage_map", "information_request"], ["prioritized_data_request", "assumption_fallbacks"], ["analysis_gaps"], "only_if_material", [6]),
      stage("G3", 6, "Design indicative structure", "decision_checkpoint", "Compare structures, terms, protections and execution complexity without presenting a final offer.", ["alternative_set", "indicative_structure"], ["term_outline", "pros_cons", "red_flags"], ["pool_analysis", "company_analysis"], "checkpoint_choice", [7]),
      stage("G3", 7, "Prepare teaser and data room", "artifact_review", "Review an editable teaser and organized evidence index tied to the model.", ["teaser", "data_room_index", "model"], ["editable_teaser", "data_room_plan", "artifact_QA"], ["signed_case_snapshot"], "checkpoint_choice", [8]),
      stage("G3", 8, "Screen capital", "capital_workspace", "See ranked fits, explicit exclusions, missing mandate data and next outreach choices.", ["mandate_set", "capital_shortlist"], ["ranked_shortlist", "exclusion_reasons", "authorized_next_step"], ["current_mandates", "approved_disclosure"], "exact_authorization", [], true),
    ],
  },
  {
    journeyId: "G4", version: "2026.09.06-v1", title: "Investor: opportunity to internal decision",
    objective: "Turn an incoming opportunity and mandate into independent underwriting work, an IC memo and explicit conditions without making the investment decision.",
    primaryIntentFamilies: ["I05", "I10", "I13", "I14", "I15"], status: "specified",
    variants: sharedVariants, gateRequirements: gates(["market"]), trustAdversarials: sharedAdversarials,
    forbiddenBehaviors: sharedForbidden,
    stages: [
      stage("G4", 1, "Resolve opportunity and mandate", "conversation", "Confirm the decision, mandate version, requested return and material conflicts.", ["opportunity", "mandate", "intent_envelope"], ["triage_readback", "mandate_gaps"], ["deal_material", "mandate_evidence"], "only_if_material", [2]),
      stage("G4", 2, "Approve underwriting work plan", "execution_brief", "Review the plan for company, transaction, model, return, downside, guarantees, covenants, diligence and IC memo.", ["execution_brief", "coverage_map"], ["underwriting plan", "return and downside plan", "security-package plan", "IC deliverables"], ["compiled_task_graph"], "checkpoint_choice", [3]),
      stage("G4", 3, "Reconstruct company and transaction", "live_work", "See facts, inconsistencies and missing information emerge from fragmented materials.", ["company_truth", "transaction_truth", "exception_ledger"], ["verified_case", "material_gaps"], ["private_deal_documents"], "only_if_material", [4]),
      stage("G4", 4, "Test economics and return", "workbench", "Inspect cash flow, debt service, downside, recovery and required-return scenarios.", ["financial_model", "return_model", "scenario_set"], ["base_return", "downside_return", "break_even_conditions"], ["reconciled_truth", "mandate_parameters"], "only_if_material", [5]),
      stage("G4", 5, "Review protections and risks", "workbench", "Navigate guarantees, covenants, waterfall, legal dependencies and key risks with citations.", ["security_package", "covenant_graph", "risk_register"], ["protection_assessment", "risk_priorities"], ["contracts", "model_outputs"], "only_if_material", [6]),
      stage("G4", 6, "Prepare diligence questions", "alignment", "Send questions ranked by impact on thesis, return, enforceability and execution.", ["diligence_request", "coverage_map"], ["prioritized_questions", "decision_impact"], ["open_findings"], "only_if_material", [7]),
      stage("G4", 7, "Prepare and independently review IC memo", "artifact_review", "Review a source-bound memo, model and independent challenge record.", ["ic_memo", "model", "review_record"], ["editable_IC_memo", "review_findings", "artifact_QA"], ["signed_underwriting_snapshot"], "checkpoint_choice", [8]),
      stage("G4", 8, "Record internal decision and conditions", "decision_checkpoint", "Record approve, decline, continue or conditional outcome as the investor decision.", ["investment_decision", "conditions"], ["decision_record", "next_actions"], ["authorized_committee_outcome"], "checkpoint_choice", [], true),
    ],
  },
  {
    journeyId: "G5", version: "2026.09.06-v1", title: "Contract, covenant and waterfall",
    objective: "Answer a financial contract question exhaustively from the effective document set, deterministic calculations and cited exceptions while preserving the legal boundary.",
    primaryIntentFamilies: ["I02", "I04", "I10", "I13"], status: "specified",
    variants: sharedVariants, gateRequirements: gates(["market", "materials"]), trustAdversarials: sharedAdversarials,
    forbiddenBehaviors: [...sharedForbidden, "Present financial interpretation as legal opinion"],
    stages: [
      stage("G5", 1, "Resolve exact question and document set", "conversation", "Confirm the clause, date, instrument, calculation period and effective versions.", ["contract_question", "document_set"], ["question_readback", "version_gaps"], ["user_question", "document_versions"], "only_if_material", [2]),
      stage("G5", 2, "Approve clause-specific work plan", "execution_brief", "Review the plan for version control, definitions, cross-references, clause graph, inputs, calculation or waterfall and cited issue list.", ["execution_brief", "coverage_map"], ["effective-document plan", "clause and cross-reference plan", "calculation/waterfall plan", "issue-list output"], ["compiled_task_graph"], "checkpoint_choice", [3]),
      stage("G5", 3, "Establish effective document set", "live_work", "See superseded, amended, missing and controlling documents separated.", ["effective_document_set", "amendment_graph"], ["version_decision", "missing_document_request"], ["contracts_and_amendments"], "only_if_material", [4]),
      stage("G5", 4, "Build clause graph", "workbench", "Navigate definitions, cross-references, thresholds, cure periods and exceptions with locators.", ["clause_graph", "defined_terms"], ["cited_clause_map", "ambiguities"], ["effective_document_set"], "none", [5]),
      stage("G5", 5, "Calculate covenant or waterfall", "workbench", "Inspect every included input, formula, timing rule and alternative interpretation.", ["calculation", "waterfall", "input_ledger"], ["deterministic_result", "sensitivity_or_interpretation_range"], ["clause_graph", "financial_inputs"], "only_if_material", [6]),
      stage("G5", 6, "Deliver cited issue list", "artifact_review", "Review conclusion, support, conflicts, missing evidence and questions for legal counsel.", ["issue_list", "review_record"], ["cited_financial_analysis", "legal_boundary", "open_items"], ["signed_clause_snapshot"], "checkpoint_choice", [7]),
      stage("G5", 7, "Apply input or document change", "continuation", "Update only affected definitions, calculations and conclusions with a visible diff.", ["dependency_graph", "version_diff"], ["localized_recalculation", "conclusion_diff"], ["new_input_or_document"], "none", [], true),
    ],
  },
  {
    journeyId: "G6", version: "2026.09.06-v1", title: "Incremental update",
    objective: "Absorb a new source, premise or correction into an existing project with transitive invalidation, bounded recomputation and decision-aware diffs.",
    primaryIntentFamilies: ["I01", "I04", "I19", "I20"], status: "specified",
    variants: sharedVariants, gateRequirements: gates(["market", "structure"]), trustAdversarials: sharedAdversarials,
    forbiddenBehaviors: sharedForbidden,
    stages: [
      stage("G6", 1, "Classify the change", "conversation", "See whether the change is a new fact, premise, correction, scope decision or authority change.", ["change_event", "prior_snapshot"], ["change_readback", "initial_impact"], ["new_input", "prior_lineage"], "only_if_material", [2]),
      stage("G6", 2, "Approve delta work plan", "execution_brief", "Review affected sources, objects, calculations, findings and artifacts before recomputation.", ["delta_plan", "dependency_graph"], ["affected-node plan", "reuse plan", "expected artifact diffs"], ["change_event", "prior_snapshot"], "checkpoint_choice", [3]),
      stage("G6", 3, "Recompute affected branches", "live_work", "Follow reused and recomputed tasks separately, including failures and preserved work.", ["task_runs", "invalidation_set"], ["recomputed_objects", "reused_objects", "branch_failures"], ["new_input", "cached_fingerprints"], "none", [4]),
      stage("G6", 4, "Review economic and artifact diff", "workbench", "See what changed, why, by how much and which prior conclusion no longer holds.", ["economic_diff", "artifact_diff", "finding_diff"], ["decision_relevant_diff", "stale_dependents"], ["old_and_new_snapshots"], "checkpoint_choice", [5]),
      stage("G6", 5, "Record new decision state", "continuation", "Accept the update, request more evidence, revert or branch without deleting history.", ["decision_log", "snapshot_version"], ["new_current_snapshot", "preserved_history"], ["authorized_user_choice"], "checkpoint_choice", [], true),
    ],
  },
  {
    journeyId: "G7", version: "2026.09.06-v1", title: "Project finance",
    objective: "Evaluate project bankability and indicative financing from contracts, construction, operations and cash-flow evidence without creating a disconnected product.",
    primaryIntentFamilies: ["I03", "I05", "I06", "I09", "I10", "I12", "I17"], status: "specified",
    variants: sharedVariants, gateRequirements: gates(), trustAdversarials: sharedAdversarials,
    forbiddenBehaviors: sharedForbidden,
    stages: [
      stage("G7", 1, "Resolve project decision and perimeter", "conversation", "Confirm project, sponsors, phase, jurisdiction, contracts, model and requested financing decision.", ["project", "intent_envelope", "contract_inventory"], ["perimeter_readback", "material_unknowns"], ["user_request", "project_documents"], "only_if_material", [2]),
      stage("G7", 2, "Approve project-finance work plan", "execution_brief", "Review the plan for construction, operations, contracts, sources and uses, drawdown, waterfall, ratios, downside, bankability, structure and capital map.", ["execution_brief", "coverage_map"], ["technical-risk plan", "contract plan", "project-model plan", "bankability and funding outputs"], ["compiled_task_graph"], "checkpoint_choice", [3]),
      stage("G7", 3, "Build project and contract truth", "live_work", "See milestones, budgets, counterparties, obligations, risks and missing evidence reconcile.", ["project_truth", "contract_graph", "risk_register"], ["verified_project_base", "contract_gaps"], ["contracts", "technical_and_financial_evidence"], "only_if_material", [4]),
      stage("G7", 4, "Build project cash-flow model", "workbench", "Inspect sources and uses, drawdown, IDC, reserve accounts, waterfall and debt service.", ["project_model", "drawdown_schedule", "waterfall"], ["CFADS", "debt_service", "reserve_profile"], ["reconciled_project_truth", "governed_assumptions"], "only_if_material", [5]),
      stage("G7", 5, "Test ratios and downside", "workbench", "Review DSCR, LLCR, PLCR and construction, ramp-up, price, volume, cost and delay scenarios.", ["scenario_set", "ratio_set"], ["ratio_headroom", "breakpoints", "mitigants"], ["project_model", "risk_register"], "only_if_material", [6]),
      stage("G7", 6, "Assess bankability and indicative structure", "decision_checkpoint", "Compare financing structures, conditions, security package and execution dependencies.", ["bankability_assessment", "indicative_structure"], ["structure_options", "conditions", "execution_plan"], ["model_outputs", "contract_graph"], "checkpoint_choice", [7]),
      stage("G7", 7, "Prepare material and capital map", "capital_workspace", "Review materials and ranked capital fit with exclusions and disclosure control.", ["project_material", "capital_shortlist"], ["editable_material", "ranked_shortlist", "authorized_next_step"], ["signed_project_snapshot", "current_mandates"], "exact_authorization", [], true),
    ],
  },
  {
    journeyId: "G8", version: "2026.09.06-v1", title: "Market and qualified connection",
    objective: "Move a sufficiently defined opportunity to an explainable, permissioned and feedback-producing capital connection, stopping at Offroad's boundary.",
    primaryIntentFamilies: ["I17", "I18", "I19", "I20"], status: "specified",
    variants: sharedVariants, gateRequirements: gates(["model"]), trustAdversarials: sharedAdversarials,
    forbiddenBehaviors: [...sharedForbidden, "Represent capital appetite, approval or commitment that was not directly evidenced"],
    stages: [
      stage("G8", 1, "Confirm market readiness", "conversation", "See whether the operation is sufficiently defined and what blocks a meaningful screen.", ["opportunity", "market_readiness"], ["readiness_decision", "blocking_gaps"], ["signed_case_snapshot", "approved_materials"], "only_if_material", [2]),
      stage("G8", 2, "Approve capital-screen work plan", "execution_brief", "Review screening fields, mandate freshness, exclusion rules, disclosure perimeter, shortlist outputs and feedback capture.", ["execution_brief", "disclosure_plan"], ["anonymous-screen plan", "mandate and freshness plan", "shortlist plan", "authorization checkpoints"], ["compiled_task_graph", "market_policy"], "checkpoint_choice", [3]),
      stage("G8", 3, "Run anonymous screen", "capital_workspace", "See eligible universe, structural exclusions and missing matching inputs without disclosing identity.", ["anonymous_opportunity", "mandate_set"], ["candidate_universe", "structural_exclusions"], ["current_mandates", "approved_anonymous_fields"], "none", [4]),
      stage("G8", 4, "Validate mandate and freshness", "live_work", "See which appetite is direct, inferred, stale, incomplete or conflicting.", ["mandate_records", "freshness_policy"], ["governed_mandates", "stale_and_missing_records"], ["mandate_sources", "market_feedback"], "only_if_material", [5]),
      stage("G8", 5, "Review ranked shortlist", "capital_workspace", "Compare fits, probabilities, reasons, exclusions and uncertainty without false precision.", ["capital_shortlist", "fit_explanations"], ["ranked_fits", "exclusions", "confidence_limits"], ["governed_mandates", "opportunity_profile"], "checkpoint_choice", [6]),
      stage("G8", 6, "Approve materials and recipients", "artifact_review", "Review the exact disclosure pack and authorize named recipients individually or by explicit set.", ["disclosure_pack", "recipient_set"], ["approved_material_version", "authorization_record"], ["company_approval", "recipient_identity"], "exact_authorization", [7]),
      stage("G8", 7, "Make qualified introduction", "capital_workspace", "Create the approved introduction and immutable disclosure record, without underwriting or distribution.", ["introduction", "disclosure_record"], ["introduction_record", "delivery_status"], ["exact_authorization", "approved_material"], "exact_authorization", [8]),
      stage("G8", 8, "Capture feedback and replan", "continuation", "Record interest, decline, diligence or proposal and update fit without rewriting declared mandates.", ["market_feedback", "outcome", "next_work_order"], ["feedback_record", "updated_shortlist_or_next_branch"], ["counterparty_feedback"], "checkpoint_choice", [], true),
    ],
  },
];

export function evaluateLongitudinalJourneyCatalogue(
  contracts: LongitudinalJourneyContract[],
): JourneyCatalogueDecision {
  const parsed = z.array(longitudinalJourneyContractSchema).length(8).parse(contracts);
  const blockers: string[] = [];
  const warnings: string[] = [];
  const seenJourneys = new Set<string>();

  for (const contract of parsed) {
    if (seenJourneys.has(contract.journeyId)) blockers.push(`duplicate_journey:${contract.journeyId}`);
    seenJourneys.add(contract.journeyId);
    const stagesById = new Map(contract.stages.map((item) => [item.stageId, item]));
    if (stagesById.size !== contract.stages.length) blockers.push(`duplicate_stage:${contract.journeyId}`);
    const briefIndex = contract.stages.findIndex((item) => item.surface === "execution_brief");
    const workIndex = contract.stages.findIndex((item) => item.surface === "live_work" || item.surface === "workbench");
    if (briefIndex < 0 || workIndex < 0 || briefIndex >= workIndex) blockers.push(`execution_brief_not_before_work:${contract.journeyId}`);
    if (!contract.stages.some((item) => item.terminal)) blockers.push(`terminal_stage_missing:${contract.journeyId}`);

    for (const item of contract.stages) {
      if (item.terminal && item.nextStageIds.length > 0) blockers.push(`terminal_has_next:${item.stageId}`);
      if (!item.terminal && item.nextStageIds.length === 0) blockers.push(`non_terminal_has_no_next:${item.stageId}`);
      for (const nextStageId of item.nextStageIds) {
        if (!stagesById.has(nextStageId)) blockers.push(`unknown_next_stage:${item.stageId}:${nextStageId}`);
        if (!nextStageId.startsWith(`${contract.journeyId}-`)) blockers.push(`cross_journey_transition:${item.stageId}:${nextStageId}`);
      }
    }

    const gateIds = contract.gateRequirements.map((item) => item.gateId);
    if (new Set(gateIds).size !== journeyGateIdSchema.options.length) blockers.push(`gate_coverage_invalid:${contract.journeyId}`);
    if (contract.status !== "production") warnings.push(`journey_not_production:${contract.journeyId}`);
  }
  for (const journeyId of goldJourneyIdSchema.options) {
    if (!seenJourneys.has(journeyId)) blockers.push(`journey_missing:${journeyId}`);
  }

  const payload = {
    valid: blockers.length === 0,
    journeyCount: parsed.length,
    blockers: [...new Set(blockers)].sort(),
    warnings: [...new Set(warnings)].sort(),
  };
  return journeyCatalogueDecisionSchema.parse({...payload, catalogueFingerprint: fingerprintJson(parsed)});
}
