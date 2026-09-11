/**
 * One deterministic format policy for every delivery the product produces.
 *
 * The policy answers a single question: for a given deliverable type and the current state of the
 * approved result, which files may a person download and under which condition. It never renders,
 * never recalculates and never reads the economic payload. Renderers stay responsible for the
 * bytes; this module decides what may be offered at all.
 *
 * Two rules are structural rather than cosmetic:
 *   * A spreadsheet is offered only where a tabular contract exists. Long text turned into rows is
 *     not a spreadsheet, and a workbook without formulas is not a financial model.
 *   * A superseded result is never presented as the current one, and a reproduction that no longer
 *     replays the approved numbers blocks the export instead of shipping a plausible file.
 */

export const deliverableFormatPolicyVersion = "2026.09.11-deliverable-formats-v1";

export type DeliverableFormat = "interactive" | "xlsx" | "pptx" | "docx" | "pdf";

/** Canonical order used by every surface, so the same delivery always lists formats the same way. */
export const deliverableFormatOrder: readonly DeliverableFormat[] = ["interactive", "xlsx", "pptx", "docx", "pdf"];

export type DeliverableType =
  | "documentary_reading"
  | "financial_model"
  | "financial_memo"
  | "executive_presentation"
  | "market_research";

/** What the file is for. The role drives the label and the expectation, never the content. */
export type DeliverableFormatRole = "reading" | "editable" | "final" | "formulas" | "tabular" | "executive";

/** The condition each format carries. Every condition is verified before the download is offered. */
export type DeliverableCondition =
  | "approved_content_and_sources"
  | "same_assumptions_and_results_version"
  | "reproduction_approved"
  | "dates_sources_and_unknown_criteria_preserved"
  | "narrative_structure_required"
  | "tabular_contract_required";

const conditionOrder: readonly DeliverableCondition[] = [
  "approved_content_and_sources",
  "same_assumptions_and_results_version",
  "reproduction_approved",
  "dates_sources_and_unknown_criteria_preserved",
  "narrative_structure_required",
  "tabular_contract_required",
];

export type DeliverableFormatRule = {
  format: DeliverableFormat;
  role: DeliverableFormatRole;
  conditions: readonly DeliverableCondition[];
};

const rule = (format: DeliverableFormat, role: DeliverableFormatRole, conditions: readonly DeliverableCondition[]): DeliverableFormatRule =>
  ({format, role, conditions});

/**
 * The policy itself. Read it as the product contract: documentary work is an editable Word plus a
 * final PDF; a financial model is a workbook with formulas, a memo in Word and PDF and an executive
 * deck; research is read in the product first and summarized afterwards; a presentation is a deck
 * plus its PDF, never long prose pushed into slides.
 */
export const deliverableFormatPolicy: Readonly<Record<DeliverableType, readonly DeliverableFormatRule[]>> = {
  documentary_reading: [
    rule("docx", "editable", ["approved_content_and_sources", "dates_sources_and_unknown_criteria_preserved"]),
    rule("pdf", "final", ["approved_content_and_sources", "dates_sources_and_unknown_criteria_preserved"]),
  ],
  financial_model: [
    rule("xlsx", "formulas", ["same_assumptions_and_results_version", "reproduction_approved", "tabular_contract_required"]),
  ],
  financial_memo: [
    rule("docx", "editable", ["same_assumptions_and_results_version", "reproduction_approved"]),
    rule("pdf", "final", ["same_assumptions_and_results_version", "reproduction_approved"]),
  ],
  executive_presentation: [
    rule("pptx", "executive", ["same_assumptions_and_results_version", "reproduction_approved", "narrative_structure_required"]),
    rule("pdf", "final", ["same_assumptions_and_results_version", "reproduction_approved", "narrative_structure_required"]),
  ],
  market_research: [
    rule("interactive", "reading", ["dates_sources_and_unknown_criteria_preserved"]),
    rule("docx", "editable", ["approved_content_and_sources", "dates_sources_and_unknown_criteria_preserved"]),
    rule("pdf", "final", ["approved_content_and_sources", "dates_sources_and_unknown_criteria_preserved"]),
    rule("xlsx", "tabular", ["dates_sources_and_unknown_criteria_preserved", "tabular_contract_required"]),
  ],
};

export type DeliverableResultState = "current" | "superseded" | "preparing" | "unavailable";

export type DeliverableContext = {
  /** Lifecycle of the result the files would be built from. */
  resultState: DeliverableResultState;
  /** Read access as it stands now, not as it stood when the result was produced. */
  accessCurrent: boolean;
  /** Whether replaying the approved inputs still produces the approved outputs. */
  reproduction: "approved" | "diverged" | "not_applicable";
  /** True only when the delivery owns a tabular contract with typed columns and units. */
  tabularContract: boolean;
  /** True only when the delivery owns a presentation structure of its own. */
  narrativeStructure: boolean;
};

export type DeliverableFormatBlock =
  | "access_expired"
  | "result_superseded"
  | "result_preparing"
  | "result_unavailable"
  | "reproduction_divergence"
  | "no_tabular_contract"
  | "no_narrative_structure";

export type DeliverableFormatDecision = {
  format: DeliverableFormat;
  role: DeliverableFormatRole;
  conditions: readonly DeliverableCondition[];
  available: boolean;
  /** Why the format is not offered. Always explains the reason; never an empty disabled control. */
  block: DeliverableFormatBlock | null;
};

function blockFor(rule: DeliverableFormatRule, context: DeliverableContext): DeliverableFormatBlock | null {
  if (!context.accessCurrent) return "access_expired";
  if (context.resultState === "superseded") return "result_superseded";
  if (context.resultState === "preparing") return "result_preparing";
  if (context.resultState === "unavailable") return "result_unavailable";
  if (rule.conditions.includes("reproduction_approved") && context.reproduction === "diverged") return "reproduction_divergence";
  if (rule.conditions.includes("tabular_contract_required") && !context.tabularContract) return "no_tabular_contract";
  if (rule.conditions.includes("narrative_structure_required") && !context.narrativeStructure) return "no_narrative_structure";
  return null;
}

function mergeConditions(left: readonly DeliverableCondition[], right: readonly DeliverableCondition[]): readonly DeliverableCondition[] {
  const merged = new Set([...left, ...right]);
  return conditionOrder.filter((condition) => merged.has(condition));
}

/**
 * Decide the formats for one delivery. A capability may carry several deliverable types (a
 * financial result is a model, a memo and a deck); the same format then appears once, carrying
 * every condition that applies to it, and is available when at least one of its types allows it.
 */
export function deliverableFormatDecisions(
  types: readonly DeliverableType[],
  context: DeliverableContext,
): readonly DeliverableFormatDecision[] {
  const byFormat = new Map<DeliverableFormat, DeliverableFormatDecision>();
  for (const type of types) {
    for (const rule of deliverableFormatPolicy[type]) {
      const block = blockFor(rule, context);
      const previous = byFormat.get(rule.format);
      if (!previous) {
        byFormat.set(rule.format, {format: rule.format, role: rule.role, conditions: rule.conditions, available: block === null, block});
        continue;
      }
      const keepPrevious = previous.available || block !== null;
      byFormat.set(rule.format, {
        format: rule.format,
        role: keepPrevious ? previous.role : rule.role,
        // Only the paths that actually allow the download contribute their conditions, so a format
        // never displays a requirement that belongs to a deliverable type it is blocked under.
        conditions: previous.available && block === null
          ? mergeConditions(previous.conditions, rule.conditions)
          : keepPrevious ? previous.conditions : rule.conditions,
        available: previous.available || block === null,
        block: previous.available || block === null ? null : previous.block,
      });
    }
  }
  return deliverableFormatOrder.filter((format) => byFormat.has(format)).map((format) => byFormat.get(format)!);
}

/** The formats a person may actually download right now. */
export function availableDeliverableFormats(types: readonly DeliverableType[], context: DeliverableContext): readonly DeliverableFormat[] {
  return deliverableFormatDecisions(types, context).filter((decision) => decision.available).map((decision) => decision.format);
}

/**
 * Server-side gate for a download route. It repeats the same decision the surface showed, so a
 * copied link cannot reach a format the policy never offered.
 */
export function deliverableFormatAllowed(
  types: readonly DeliverableType[],
  format: string,
  context: DeliverableContext,
): {allowed: true} | {allowed: false; block: DeliverableFormatBlock | "format_not_in_policy"} {
  const decisions = deliverableFormatDecisions(types, context);
  const decision = decisions.find((candidate) => candidate.format === format);
  if (!decision) return {allowed: false, block: "format_not_in_policy"};
  if (decision.available) return {allowed: true};
  return {allowed: false, block: decision.block ?? "format_not_in_policy"};
}

type Localized = {pt: string; en: string};

/**
 * Plain explanations for the download routes, which answer in text and not in React. The web
 * surfaces use their own message catalogs with the same codes as keys.
 */
export const deliverableFormatBlockCopy: Readonly<Record<DeliverableFormatBlock | "format_not_in_policy", Localized>> = {
  access_expired: {
    pt: "Seu acesso a este projeto não está mais vigente, então o arquivo não foi gerado.",
    en: "Your access to this project is no longer current, so the file was not produced.",
  },
  result_superseded: {
    pt: "Este resultado foi substituído por uma versão mais recente. Abra o resultado vigente e exporte a partir dele.",
    en: "This result was superseded by a newer version. Open the current result and export from it.",
  },
  result_preparing: {
    pt: "O resultado ainda está sendo preparado. O arquivo fica disponível quando o cálculo terminar.",
    en: "The result is still being prepared. The file becomes available when the calculation finishes.",
  },
  result_unavailable: {
    pt: "Este resultado não está disponível para exportação: resolva as pendências indicadas e peça uma nova revisão.",
    en: "This result is not available for export: resolve the listed issues and request a new review.",
  },
  reproduction_divergence: {
    pt: "A reprodução dos números aprovados não conferiu, então nenhum arquivo foi gerado. Peça uma nova revisão da configuração antes de exportar.",
    en: "Reproducing the approved numbers did not match, so no file was produced. Request a new review of the configuration before exporting.",
  },
  no_tabular_contract: {
    pt: "Esta entrega não tem estrutura tabular própria, então a planilha não é oferecida. Use o documento ou o PDF.",
    en: "This delivery has no tabular structure of its own, so the spreadsheet is not offered. Use the document or the PDF.",
  },
  no_narrative_structure: {
    pt: "Esta entrega não tem estrutura de apresentação própria, então a apresentação não é oferecida. Use o documento ou o PDF.",
    en: "This delivery has no presentation structure of its own, so the deck is not offered. Use the document or the PDF.",
  },
  format_not_in_policy: {
    pt: "Este formato não faz parte da política de entrega deste tipo de material.",
    en: "This format is not part of the delivery policy for this type of material.",
  },
};
