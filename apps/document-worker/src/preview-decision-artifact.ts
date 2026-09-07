import {
  buildDecisionArtifactContract,
  type DecisionArtifactContract,
  type DecisionArtifactContractInput,
} from "@offroad/case-understanding";
import {case01, preview} from "@offroad/credit-playbook";

type PreviewStepOutput = preview.PreviewStepOutput;

type Source = DecisionArtifactContractInput["sources"][number];
type Claim = DecisionArtifactContractInput["claims"][number];
type Gap = DecisionArtifactContractInput["gaps"][number];
type Assumption = DecisionArtifactContractInput["assumptions"][number];
type Series = NonNullable<DecisionArtifactContractInput["series"]>[number];

type Anchor = {
  document: string;
  page?: number;
  clause?: string;
  table?: string;
  note?: string;
  asOf?: string;
};

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

const record = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value)
  ? value as Record<string, unknown>
  : null;

const leaf = (value: unknown, path: string): unknown => path.split(".").reduce<unknown>((current, key) => {
  if (Array.isArray(current) && /^\d+$/.test(key)) return current[Number(key)];
  return record(current)?.[key];
}, value);

const primitive = (value: unknown): string | number | boolean | null => typeof value === "string" || typeof value === "number" || typeof value === "boolean"
  ? value
  : null;

const textIncludes = (value: unknown, pattern: RegExp): boolean => {
  if (typeof value === "string") return pattern.test(value);
  if (Array.isArray(value)) return value.some((item) => textIncludes(item, pattern));
  const object = record(value);
  return object ? Object.values(object).some((item) => textIncludes(item, pattern)) : false;
};

function anchorsIn(value: unknown, depth = 0): Anchor[] {
  if (depth > 12 || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.flatMap((item) => anchorsIn(item, depth + 1));
  const object = record(value);
  if (!object) return [];
  const own = typeof object.document === "string" && object.document.trim()
    ? [{
        document: object.document,
        ...(typeof object.page === "number" ? {page: object.page} : {}),
        ...(typeof object.clause === "string" ? {clause: object.clause} : {}),
        ...(typeof object.table === "string" ? {table: object.table} : {}),
        ...(typeof object.note === "string" ? {note: object.note} : {}),
        ...(typeof object.asOf === "string" ? {asOf: object.asOf} : {}),
      }]
    : [];
  return [...own, ...Object.values(object).flatMap((item) => anchorsIn(item, depth + 1))];
}

function sourceClassification(document: string): Source["classification"] {
  if (/anbima|bcb|banco[_ -]?central|calendario|curve/i.test(document)) return "market";
  if (/fixture|simulad|gabarito|reference-data|exit-costs/i.test(document)) return "synthetic";
  return "public";
}

function sourceLocator(anchor: Anchor): string {
  return [
    anchor.document,
    anchor.page === undefined ? null : `p. ${anchor.page}`,
    anchor.clause ? `cláusula ${anchor.clause}` : null,
    anchor.table ? `tabela ${anchor.table}` : null,
    anchor.note ?? null,
  ].filter(Boolean).join(" · ");
}

function outputFingerprint(taskId: string, output: PreviewStepOutput): string {
  const signed = record(output.trace)?.outputFingerprint;
  return typeof signed === "string" && /^[a-f0-9]{64}$/.test(signed)
    ? signed
    : preview.fingerprintOf({taskId, output});
}

/**
 * Compiles the objects produced by the live Case 01 workflow into one governed decision product.
 * Delivery surfaces reference claims; they never restate an economic value of their own.
 */
export function compilePreviewDecisionArtifact(input: {
  caseId: string;
  asOf: string;
  outputs: Map<string, PreviewStepOutput>;
  premises: preview.PreviewPremises;
  viewArtifactFingerprints?: Partial<Record<"conversation" | "workbook" | "presentation", string>>;
}): DecisionArtifactContract {
  const sources = new Map<string, Source>();
  const sourceIds = (value: unknown): string[] => {
    const ids = anchorsIn(value).map((anchor) => {
      const locator = sourceLocator(anchor);
      const id = `source-${preview.fingerprintOf(locator).slice(0, 16)}`;
      if (!sources.has(id)) sources.set(id, {
        id,
        title: anchor.document,
        classification: sourceClassification(anchor.document),
        asOf: anchor.asOf && datePattern.test(anchor.asOf) ? anchor.asOf : input.asOf,
        locator,
      });
      return id;
    });
    return [...new Set(ids)].sort();
  };

  const ledger = input.outputs.get("C05");
  const reconciliation = input.outputs.get("D07");
  const covenants = input.outputs.get("C09");
  const maturities = input.outputs.get("C10");
  const interest = input.outputs.get("C07");
  const exitCosts = input.outputs.get("S07");
  const scenarios = input.outputs.get("C08");
  const alternatives = input.outputs.get("S10");

  const gaps: Gap[] = [];
  const addGap = (gap: Gap) => { if (!gaps.some((candidate) => candidate.id === gap.id)) gaps.push(gap); };
  if (covenants && (covenants.state !== "resolved" || textIncludes(covenants, /insufficient_evidence|unproven|unresolved|legal review/i))) addGap({
    id: "gap-covenant-definition-and-headroom",
    label: "Covenants e headroom ainda condicionais",
    materiality: "blocker",
    impact: "Impede afirmar limite aplicável, comparabilidade do EBITDA e folga contratual com convicção.",
    requestedInput: "Definições contratuais vigentes, memória do último teste, EBITDA aberto e comprovação das condições de mudança de tier.",
  });
  if (maturities && textIncludes(maturities, /operating_generation|CFADS|cash generation|generation declared/i)) addGap({
    id: "gap-forward-cash-generation",
    label: "Geração de caixa futura não declarada",
    materiality: "blocker",
    impact: "A cobertura dos vencimentos não pode ser tratada como capacidade de pagamento completa; caixa inicial não substitui CFADS projetado.",
    requestedInput: "Plano financeiro por período com receita, margem, capital de giro, capex, impostos e CFADS.",
  });
  if (reconciliation && reconciliation.state !== "resolved" && reconciliation.state !== "complete") addGap({
    id: "gap-financial-reconciliation",
    label: "Conciliações financeiras abertas",
    materiality: "high",
    impact: "Linhas com definições ou fontes divergentes podem alterar dívida, caixa, EBITDA e os indicadores derivados.",
    requestedInput: "Razão ou memória de conciliação que explique as diferenças entre demonstrações, notas e release.",
  });
  if (exitCosts && (exitCosts.state !== "complete" || textIncludes(exitCosts, /insufficient_evidence|unknown|not computed|not priced/i))) addGap({
    id: "gap-exit-costs",
    label: "Custos de saída não integralmente precificados",
    materiality: "high",
    impact: "Sem prêmio de pré-pagamento e demais custos por série, a economia do refinanciamento e o all-in não fecham.",
    requestedInput: "Cotação de resgate ou fórmula contratual aplicável, data de liquidação e custos de transação por instrumento.",
  });
  if (interest && (interest.state !== "complete" || textIncludes(interest, /curve|insufficient_evidence|hypothetical|unknown/i))) addGap({
    id: "gap-market-curves-and-hedge",
    label: "Curvas e hedge precisam de atualização",
    materiality: "high",
    impact: "Juros, indexação, exposição cambial e custo efetivo podem mudar a comparação entre instrumentos.",
    requestedInput: "Curvas DI/IPCA e câmbio na data-base, posições de hedge, forma de pagamento ou capitalização e convenções de cada série.",
  });
  if (scenarios && (scenarios.state !== "declared" || textIncludes(scenarios, /blocked|uncovered|insufficient_evidence/i))) addGap({
    id: "gap-integrated-forward-model",
    label: "Modelo prospectivo integrado incompleto",
    materiality: "blocker",
    impact: "Sem projeções integradas não é responsável dimensionar dívida, recomendar termos ou concluir sustentabilidade futura.",
    requestedInput: "Orçamento da administração, cronograma de capex, caixa mínimo, amortizações, impostos e sensibilidades operacionais.",
  });
  if (alternatives && (alternatives.state !== "compared" || textIncludes(alternatives, /indicative_unverified|uncovered|unsupported|not computed|blocked/i))) addGap({
    id: "gap-executable-market-terms",
    label: "Termos de mercado ainda indicativos",
    materiality: "high",
    impact: "O ranking é uma comparação analítica, não uma proposta executável nem evidência de apetite de investidores.",
    requestedInput: "Term sheets, feedback de mercado, parâmetros de distribuição e custos completos das alternativas selecionadas.",
  });

  const assumptions: Assumption[] = [];
  const alternativesInput = case01.case01Evidence()["compare-refinancing-before-after"];
  const firstNewDebt = alternativesInput.alternatives.find((alternative) => alternative.newDebt)?.newDebt;
  if (firstNewDebt) {
    const ids = sourceIds(firstNewDebt.anchor);
    assumptions.push(
      {id: "assumption-new-debt-rate", label: "Taxa anual da nova dívida", value: input.premises.newDebtAnnualRate ?? firstNewDebt.annualRate, unit: "decimal a.a.", basis: input.premises.newDebtAnnualRate ? "Premissa alterada na conversa." : firstNewDebt.origin, sourceIds: ids, editable: true, material: true},
      {id: "assumption-new-debt-term", label: "Prazo da nova dívida", value: input.premises.newDebtTermMonths ?? firstNewDebt.termMonths, unit: "meses", basis: input.premises.newDebtTermMonths === undefined ? firstNewDebt.origin : "Premissa alterada na conversa.", sourceIds: ids, editable: true, material: true},
      {id: "assumption-new-debt-grace", label: "Carência da nova dívida", value: input.premises.newDebtGraceMonths ?? firstNewDebt.graceMonths, unit: "meses", basis: input.premises.newDebtGraceMonths === undefined ? firstNewDebt.origin : "Premissa alterada na conversa.", sourceIds: ids, editable: true, material: true},
    );
  }

  const claims: Claim[] = [];
  const addClaim = (candidate: {
    id: string;
    label: string;
    taskId: string;
    output: PreviewStepOutput | undefined;
    path: string;
    value?: unknown;
    unit: string | null;
    evidenceState: Claim["evidenceState"];
    lineage?: unknown;
    assumptionIds?: string[];
    gapIds?: string[];
  }) => {
    if (!candidate.output) return;
    const value = primitive(candidate.value === undefined ? leaf(candidate.output, candidate.path) : candidate.value);
    if (value === null && candidate.evidenceState !== "not_computable") return;
    claims.push({
      id: candidate.id,
      label: candidate.label,
      value,
      unit: candidate.unit,
      evidenceState: candidate.evidenceState,
      object: {
        id: candidate.taskId.toLowerCase(),
        type: typeof candidate.output.schema_version === "string" ? candidate.output.schema_version : candidate.taskId.toLowerCase(),
        fingerprint: outputFingerprint(candidate.taskId, candidate.output),
        path: candidate.path,
      },
      sourceIds: sourceIds(candidate.lineage ?? candidate.output),
      assumptionIds: candidate.assumptionIds ?? [],
      gapIds: candidate.gapIds?.filter((id) => gaps.some((gap) => gap.id === id)) ?? [],
    });
  };

  addClaim({id: "claim-gross-debt", label: "Dívida bruta contábil", taskId: "C05", output: ledger, path: "gross_debt", unit: typeof ledger?.unit === "string" ? ledger.unit : null, evidenceState: "calculated", lineage: {unit: ledger?.unit_anchor, rows: ledger?.ledger_rows}});
  addClaim({id: "claim-net-debt-release", label: "Dívida líquida — definição do release", taskId: "C05", output: ledger, path: "net_debt_views.release.value", unit: typeof ledger?.unit === "string" ? ledger.unit : null, evidenceState: "calculated", lineage: {view: leaf(ledger, "net_debt_views.release"), rows: ledger?.ledger_rows}, gapIds: ["gap-financial-reconciliation"]});

  const peakPeriod = primitive(leaf(maturities, "peak.period"));
  const peakWall = Array.isArray(maturities?.walls) ? (maturities.walls as unknown[]).find((wall) => record(wall)?.period === peakPeriod) : null;
  addClaim({id: "claim-peak-maturity-amount", label: peakPeriod ? `Pico de vencimentos — ${peakPeriod}` : "Pico de vencimentos", taskId: "C10", output: maturities, path: "peak.amount", unit: typeof maturities?.unit === "string" ? maturities.unit : null, evidenceState: "calculated", lineage: peakWall ?? maturities, gapIds: ["gap-forward-cash-generation"]});
  addClaim({id: "claim-peak-maturity-period", label: "Período do pico de vencimentos", taskId: "C10", output: maturities, path: "peak.period", unit: null, evidenceState: "calculated", lineage: peakWall ?? maturities});

  const covenantRows = Array.isArray(covenants?.covenants) ? covenants.covenants as unknown[] : [];
  const covenantIndex = covenantRows.findIndex((candidate) => primitive(leaf(candidate, "index.value")) !== null);
  if (covenantIndex >= 0) {
    const covenant = covenantRows[covenantIndex];
    addClaim({id: "claim-reported-leverage", label: "Alavancagem reportada", taskId: "C09", output: covenants, path: `covenants.${covenantIndex}.index.value`, unit: "x", evidenceState: "mixed", lineage: covenant, gapIds: ["gap-covenant-definition-and-headroom"]});
  }

  const leadingAlternative = primitive(leaf(alternatives, "ranking.order.0.id"));
  if (leadingAlternative !== null) {
    const alternativeRows = Array.isArray(alternatives?.alternatives) ? alternatives.alternatives as unknown[] : [];
    const selected = alternativeRows.find((candidate) => record(candidate)?.id === leadingAlternative);
    addClaim({
      id: "claim-leading-alternative",
      label: "Alternativa líder no critério declarado",
      taskId: "S10",
      output: alternatives,
      path: "ranking.order.0.id",
      unit: null,
      evidenceState: "mixed",
      lineage: selected ?? alternatives,
      assumptionIds: assumptions.map((assumption) => assumption.id),
      gapIds: ["gap-covenant-definition-and-headroom", "gap-exit-costs", "gap-market-curves-and-hedge", "gap-integrated-forward-model", "gap-executable-market-terms"],
    });
  }

  if (claims.length === 0) throw new Error("preview decision artifact has no governed claim to display");

  const series: Series[] = [];
  const maturityRows = Array.isArray(maturities?.walls) ? maturities.walls as unknown[] : [];
  const maturityPoints = maturityRows.flatMap((candidate) => {
    const row = record(candidate);
    const label = primitive(row?.period);
    const rawAmount = primitive(row?.amount);
    const amount = typeof rawAmount === "number" ? rawAmount : typeof rawAmount === "string" && rawAmount.trim() !== "" ? Number(rawAmount) : Number.NaN;
    if (typeof label !== "string" || !Number.isFinite(amount)) return [];
    return [{label, value: amount, evidenceState: "calculated" as const, sourceIds: sourceIds(candidate), assumptionIds: [], gapIds: []}];
  });
  if (maturities && maturityPoints.length > 0) series.push({
    id: "series-maturity-wall",
    label: "Vencimentos contratuais",
    unit: typeof maturities.unit === "string" ? maturities.unit : null,
    chartKind: "column",
    object: {id: "c10", type: typeof maturities.schema_version === "string" ? maturities.schema_version : "maturity_wall", fingerprint: outputFingerprint("C10", maturities), path: "walls"},
    points: maturityPoints,
  });

  const metricClaimIds = claims.filter((claim) => claim.id !== "claim-leading-alternative").map((claim) => claim.id);
  const decisionClaimIds = claims.filter((claim) => claim.id === "claim-leading-alternative").map((claim) => claim.id);
  const allSourceIds = [...sources.keys()].sort();
  const allAssumptionIds = assumptions.map((assumption) => assumption.id);
  const allGapIds = gaps.map((gap) => gap.id);
  const block = (id: string, kind: "headline" | "metric" | "table" | "chart" | "narrative" | "decision" | "gap" | "source_register", title: string, claimIds: string[], sourceIdsForBlock: string[] = [], assumptionIds: string[] = [], gapIds: string[] = [], seriesIds: string[] = []) => ({id, kind, title, claimIds, sourceIds: sourceIdsForBlock, assumptionIds, gapIds, seriesIds});
  const gapBlock = allGapIds.length ? [block("open-gaps", "gap", "O que ainda muda a decisão", [], [], [], allGapIds)] : [];
  const assumptionBlock = allAssumptionIds.length ? [block("editable-assumptions", "table", "Premissas editáveis", [], [], allAssumptionIds, [])] : [];
  const decisionBlock = decisionClaimIds.length ? [block("analytical-direction", "decision", "Direção analítica — não é recomendação final", decisionClaimIds)] : [];

  const fingerprintFor = (surface: "conversation" | "workbook" | "presentation") => {
    const candidate = input.viewArtifactFingerprints?.[surface];
    return candidate && /^[a-f0-9]{64}$/.test(candidate) ? candidate : null;
  };
  const views: DecisionArtifactContractInput["views"] = [
    {
      surface: "conversation",
      artifactId: "preview-chat-readout",
      artifactKind: "chat_readout",
      artifactFingerprint: fingerprintFor("conversation"),
      blocks: [block("executive-metrics", "metric", "Leitura financeira", metricClaimIds), ...decisionBlock, ...gapBlock],
    },
    {
      surface: "workbook",
      artifactId: "preview-financial-model",
      artifactKind: "xlsx",
      artifactFingerprint: fingerprintFor("workbook"),
      blocks: [block("model-control", "metric", "Controle e indicadores", metricClaimIds), ...assumptionBlock, ...decisionBlock, ...gapBlock],
    },
    {
      surface: "presentation",
      artifactId: "preview-decision-deck",
      artifactKind: "pptx",
      artifactFingerprint: fingerprintFor("presentation"),
      blocks: [
        block("decision-headline", "headline", "Situação e implicação", metricClaimIds.filter((id) => !id.startsWith("claim-peak-maturity"))),
        ...(series.length ? [block("maturity-wall", "chart", "Vencimentos contratuais", metricClaimIds.filter((id) => id.startsWith("claim-peak-maturity")), [], [], [], series.map((item) => item.id))] : []),
        ...decisionBlock,
        ...gapBlock,
      ],
    },
  ];

  // A source register is useful when all other blocks happen to rely only on calculated claims.
  if (allSourceIds.length > 0) {
    for (const view of views) view.blocks.push(block("source-register", "source_register", "Fontes e data-base", [], allSourceIds));
  }

  return buildDecisionArtifactContract({
    schemaVersion: "2026.09.07-v1",
    caseId: input.caseId,
    snapshotFingerprint: preview.fingerprintOf({
      asOf: input.asOf,
      objects: [...input.outputs.entries()].map(([taskId, output]) => ({taskId, fingerprint: outputFingerprint(taskId, output)})).sort((a, b) => a.taskId.localeCompare(b.taskId)),
      premises: input.premises,
    }),
    asOf: input.asOf,
    status: "draft",
    release: {state: "internal_only", recipientIds: []},
    sources: [...sources.values()].sort((a, b) => a.id.localeCompare(b.id)),
    assumptions,
    gaps,
    claims,
    series,
    views,
    identityRequirements: metricClaimIds.map((claimId) => ({claimId, surfaces: ["conversation", "workbook", "presentation"]})),
  });
}
