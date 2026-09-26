import {
  latestActiveDealState,
  parseCompiledStructure,
  parseGovernedMatchScreen,
  parseProductionPlan,
  parseUnderstanding,
  type DealStateRow,
  type DealStateWorkbench,
} from "./workbench";
import {governedMaterialPackageFromRows} from "./materials";

/**
 * A result the case analysis produces after a person's decision, missing while no analysis runs.
 * It used to be shown as analysis in progress; it is a gap, and its next step is to resume the
 * analysis of that decision. Each gap names the decision the analysis starts from.
 */
export type DealStateGap = "structure" | "structure_revision" | "production_plan" | "materials" | "match_screen";

export const dealStateGapTrigger = {
  structure: "understanding_confirmed",
  structure_revision: "structure_changes_requested",
  production_plan: "structure_confirmed",
  materials: "production_plan_approved",
  match_screen: "material_package_approved",
} as const satisfies Record<DealStateGap, string>;

type GapFacts = {
  understandingStatus: string | null;
  structureCreatedAt: string | null;
  decision: {status: string; createdAt: string} | null;
  productionPlanStatus: string | null;
  materialsPresent: boolean;
  packageReviewStatus: string | null;
  /** The governed match screen of the current package review and materials exists. */
  matchScreenPresent: boolean;
};

const confirmed = (status: string | null | undefined) => status === "confirmed" || status === "approved";

/** The most advanced decision whose result is missing. Decisions still awaiting a person (a
 * pending understanding, structure, plan or package) are not gaps. */
export function dealStateAnalysisGap(facts: GapFacts): DealStateGap | null {
  const {decision} = facts;
  if (facts.packageReviewStatus === "approved" && !facts.matchScreenPresent) return "match_screen";
  if (facts.productionPlanStatus === "approved" && !facts.materialsPresent) return "materials";
  if (decision && confirmed(decision.status) && !facts.productionPlanStatus) return "production_plan";
  if (decision?.status === "changes_requested"
    && !(facts.structureCreatedAt && Date.parse(facts.structureCreatedAt) > Date.parse(decision.createdAt))) return "structure_revision";
  if (confirmed(facts.understandingStatus) && !facts.structureCreatedAt) return "structure";
  return null;
}

/**
 * A gap whose analysis is held until a person approves its execution brief. Its next step is that
 * approval, never a resume: resuming would only replay the held job. `href` is where the approval
 * control is, or null while the page has none to show (the brief is still being prepared).
 */
export type DealStateGapApproval = {href: string | null};

/** The approval a gap waits for, or null when its next step is to resume the analysis. */
export function dealStateGapApproval(
  workbench: Pick<DealStateWorkbench, "awaitingApproval">,
  href: string | null,
): DealStateGapApproval | null {
  return workbench.awaitingApproval ? {href} : null;
}

/** The gap a page shows: none while the case analysis runs. */
export function workbenchAnalysisGap(workbench: DealStateWorkbench, materialsPresent: boolean): DealStateGap | null {
  if (workbench.isProcessing) return null;
  return dealStateAnalysisGap({
    understandingStatus: workbench.understanding?.row.status ?? null,
    structureCreatedAt: workbench.structure?.row.created_at ?? null,
    decision: workbench.structureDecision ? {status: workbench.structureDecision.status, createdAt: workbench.structureDecision.created_at} : null,
    productionPlanStatus: workbench.productionPlan?.row.status ?? null,
    materialsPresent,
    packageReviewStatus: workbench.packageReview?.status ?? null,
    matchScreenPresent: workbench.matchScreen !== null,
  });
}

/** The same gap read from the stored rows, as a command decides it on the server. */
export function rowsAnalysisGap(rows: readonly DealStateRow[]): DealStateGap | null {
  const latest = latestActiveDealState(rows);
  const decision = latest.get("structure_decision");
  return dealStateAnalysisGap({
    understandingStatus: parseUnderstanding(latest.get("understanding_snapshot"))?.row.status ?? null,
    structureCreatedAt: parseCompiledStructure(latest.get("structure_option"))?.row.created_at ?? null,
    decision: decision ? {status: decision.status, createdAt: decision.created_at} : null,
    productionPlanStatus: parseProductionPlan(latest.get("production_plan"))?.row.status ?? null,
    materialsPresent: governedMaterialPackageFromRows(rows) !== null,
    packageReviewStatus: latest.get("package_review")?.status ?? null,
    matchScreenPresent: parseGovernedMatchScreen(
      latest.get("match_screen"),
      latest.get("package_review"),
      latest.get("material_artifact"),
    ) !== null,
  });
}
