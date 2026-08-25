import Decimal from "decimal.js";
import type {CaseBrief} from "@offroad/case-understanding";
import {covenantsFor, type InstrumentVerdict} from "@offroad/credit-playbook";
import type {DeskAnalysis, InternalRating, OperationVerdict, StressScenario, Trajectory} from "@offroad/credit-analysis";
import type {CollateralPackage} from "@offroad/deal-structure";
import type {IndicativePrice} from "@offroad/market-reference";
import type {IndicativeTermSheet} from "@offroad/deal-structure";
import type {ReconciledFact, ReconciliationException, TracedCalculation} from "@offroad/reconciliation";

import type {Material, MaterialBlock} from "./compile";
import {capitalStructure, covenantSchedule, riskFactors, sourcesAndUses, trajectoryTable} from "./desk-sections";

/**
 * The two documents a DCM adviser prepares for a transaction: the credit memorandum and the
 * indicative term sheet.
 *
 * The package that existed before was a credit profile with a term table appended. A desk
 * circulates something more specific. The memorandum opens with the key terms on one card, so
 * a portfolio manager knows in ten seconds what is being asked and on what basis, and then
 * builds the case in the order a professional investor assesses it: the transaction, the company, the numbers,
 * the structure, the trajectory, the risks with their treatment, and the basis of preparation
 * stated in full. The term sheet is a two-column document that a lawyer can mark up: every
 * term with its value, its basis and, where the company asked for something the analysis does
 * not support, both sides of that conversation.
 *
 * Nothing here is prose a model wrote. The narrative comes from the audited brief; everything
 * else is assembled from computed values with their citable ids.
 */

const money = (value: Decimal.Value, locale: "pt-BR" | "en-US") =>
  `R$ ${new Decimal(value).toNumber().toLocaleString(locale, {maximumFractionDigits: 0})}`;
const turns = (value: Decimal.Value, locale: "pt-BR" | "en-US") =>
  `${new Decimal(value).toNumber().toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})}x`;
const pct = (value: Decimal.Value, locale: "pt-BR" | "en-US") =>
  `${new Decimal(value).times(100).toNumber().toLocaleString(locale, {minimumFractionDigits: 2, maximumFractionDigits: 2})}%`;
const bi = (pt: string, en: string) => ({pt, en});

export type InstitutionalInput = {
  brief: CaseBrief;
  facts: readonly ReconciledFact[];
  calculations: readonly TracedCalculation[];
  exceptions: readonly ReconciliationException[];
  desk: DeskAnalysis;
  trajectory: Trajectory | null;
  termSheet?: IndicativeTermSheet;
  companyName?: string;
  rating?: InternalRating;
  stress?: StressScenario[];
  instruments?: InstrumentVerdict[];
  collateral?: CollateralPackage;
  price?: IndicativePrice;
  /** The judgement on the operation the company asked for. */
  verdict?: OperationVerdict;
};

/**
 * Structure supportability first, before the analysis behind it.
 *
 * A memorandum that opens with the company and reaches the judgement on page nine is a
 * document written for its author. The reader wants to know whether the deal stands, what has
 * to be true for it to stand, what the money buys and what it leaves; the analysis behind each
 * of those is the rest of the document, and it is read only by whoever disagrees.
 */
export function verdictSection(verdict: OperationVerdict): MaterialBlock[] {
  const blocks: MaterialBlock[] = [{type: "paragraph", text: verdict.headline}];
  if (verdict.conditions.length > 0) {
    blocks.push({
      type: "kv",
      caption: bi("Condições precedentes", "Conditions precedent"),
      rows: verdict.conditions.map((condition, index) => ({
        label: bi(`Condição ${index + 1}`, `Condition ${index + 1}`),
        value: {pt: condition.pt, en: condition.en},
      })),
    });
  }
  if (verdict.solves.length > 0) {
    blocks.push({type: "heading", text: bi("O que a operação resolve", "What the operation solves")});
    blocks.push({type: "list", items: verdict.solves.map((note) => ({pt: note.pt, en: note.en}))});
  }
  if (verdict.leaves.length > 0) {
    blocks.push({type: "heading", text: bi("O que ela não resolve", "What it does not solve")});
    blocks.push({type: "list", items: verdict.leaves.map((note) => ({pt: note.pt, en: note.en}))});
  }
  for (const alternative of verdict.alternatives) {
    blocks.push({
      type: "callout",
      title: bi(
        `Alternativa: R$ ${(Number(alternative.amount) / 1_000_000).toFixed(0)}M em ${alternative.termMonths} meses`,
        `Alternative: R$ ${(Number(alternative.amount) / 1_000_000).toFixed(0)}M over ${alternative.termMonths} months`,
      ),
      items: [
        {label: bi("Por quê", "Why"), value: {pt: alternative.why.pt, en: alternative.why.en}},
        {label: bi("O que muda", "What changes"), value: {pt: alternative.tradeoff.pt, en: alternative.tradeoff.en}},
      ],
    });
  }
  return blocks;
}

const termValue = (termSheet: IndicativeTermSheet | undefined, id: string) =>
  termSheet?.terms.find((term) => term.id === id);

/** Analytical factors, stress, eligible instruments and the proposed security package. */
export function creditConsiderationsSection(input: InstitutionalInput): MaterialBlock[] {
  const blocks: MaterialBlock[] = [];
  if (input.rating) {
    const r = input.rating;
    blocks.push({type: "heading", text: bi("Perfil analítico indicativo", "Indicative analytical profile")});
    blocks.push({type: "paragraph", text: r.summary});
    blocks.push({type: "kv", caption: bi("Fatores", "Factors"), rows: r.factors.map((factor) => ({label: factor.labels, value: bi(factor.points === null ? "não avaliado" : `${factor.points} de 4 (peso ${factor.weight})`, factor.points === null ? "not assessed" : `${factor.points} of 4 (weight ${factor.weight})`), note: factor.rationale}))});
  }
  if (input.stress && input.stress.length > 0) {
    blocks.push({type: "heading", text: bi("Sensibilidade", "Sensitivity")});
    blocks.push({
      type: "table",
      caption: bi("Choques padrão sobre a posição pós-operação", "Standard shocks on the post-transaction position"),
      head: [bi("Cenário", "Scenario"), bi("Alavancagem", "Leverage"), bi("Juros anuais", "Annual interest"), bi("Folga de covenant", "Covenant headroom"), bi("Rompe?", "Breaches?")],
      rows: input.stress.map((row) => [row.labels.pt, row.leverage ? turns(row.leverage, "pt-BR") : "n/d", row.annualInterest ? money(row.annualInterest, "pt-BR") : "n/d", row.covenantHeadroom ? money(row.covenantHeadroom, "pt-BR") : "n/d", row.breachesCovenant === null ? "n/d" : row.breachesCovenant ? "sim" : "não"]),
    });
  }
  if (input.instruments && input.instruments.length > 0) {
    const open = input.instruments.filter((verdict) => verdict.eligible);
    const closed = input.instruments.filter((verdict) => !verdict.eligible);
    blocks.push({type: "heading", text: bi("Instrumentos", "Instruments")});
    blocks.push({type: "kv", caption: bi("Papéis que o perfil admite", "Papers the profile admits"), rows: open.map((verdict) => ({label: verdict.instrument.labels, value: bi(`${verdict.instrument.tenorMonths.min} a ${verdict.instrument.tenorMonths.max} meses; ${verdict.instrument.buyers.join(", ")}`, `${verdict.instrument.tenorMonths.min} to ${verdict.instrument.tenorMonths.max} months; ${verdict.instrument.buyers.join(", ")}`), ...(verdict.reasons[0] ? {note: verdict.reasons[0]} : {})}))});
    if (closed.length > 0) blocks.push({type: "list", items: closed.map((verdict) => bi(`${verdict.instrument.labels.pt}: ${verdict.reasons[0]!.pt}`, `${verdict.instrument.labels.en}: ${verdict.reasons[0]!.en}`))});
  }
  if (input.price) {
    const p = input.price;
    blocks.push({type: "heading", text: bi("Referência indicativa de preço", "Indicative pricing reference")});
    blocks.push({type: "kv", rows: [
      {label: bi("Faixa", "Range"), value: bi(`CDI + ${(p.bps.min / 100).toFixed(2).replace(".", ",")}% a CDI + ${(p.bps.max / 100).toFixed(2).replace(".", ",")}% a.a.`, `CDI + ${(p.bps.min / 100).toFixed(2)}% to CDI + ${(p.bps.max / 100).toFixed(2)}% p.a.`), note: bi(`Base: banda ${p.rating} para ${p.instrument}, ${p.base.bps.min} a ${p.base.bps.max} bps.`, `Base: ${p.rating} band for ${p.instrument}, ${p.base.bps.min} to ${p.base.bps.max} bps.`)},
      ...p.adjustments.map((adjustment) => ({label: bi(`Ajuste: ${adjustment.id}`, `Adjustment: ${adjustment.id}`), value: bi(`${adjustment.bps >= 0 ? "+" : ""}${adjustment.bps} bps`, `${adjustment.bps >= 0 ? "+" : ""}${adjustment.bps} bps`), note: adjustment.rationale})),
      {label: bi("Proveniência", "Provenance"), value: bi(p.provenance.kind === "desk_practice" ? `Prática da mesa, declarada em ${p.provenance.statedOn}; não é observação de operações fechadas.` : `Observada em ${p.provenance.sample} operações nos últimos ${p.provenance.windowMonths} meses.`, p.provenance.kind === "desk_practice" ? `Desk practice, stated on ${p.provenance.statedOn}; not an observation of closed deals.` : `Observed across ${p.provenance.sample} deals in the last ${p.provenance.windowMonths} months.`)},
    ]});
  }
  if (input.collateral) {
    const c = input.collateral;
    blocks.push({type: "heading", text: bi("Pacote de garantias", "Security package")});
    blocks.push({type: "paragraph", text: bi(`Cobertura alvo de ${turns(c.target.coverage, "pt-BR")} sobre ${money(c.target.amount, "pt-BR")}; o pacote proposto cobre ${turns(c.coverageAchieved, "pt-BR")}${c.sufficient ? "." : `, faltando ${money(c.shortfall!, "pt-BR")} de valor elegível.`}`, `Target coverage of ${turns(c.target.coverage, "en-US")} over ${money(c.target.amount, "en-US")}; the proposed package covers ${turns(c.coverageAchieved, "en-US")}${c.sufficient ? "." : `, ${money(c.shortfall!, "en-US")} of eligible value short.`}`)});
    blocks.push({
      type: "table",
      caption: bi("Ativos, haircut e valor elegível", "Assets, haircut and eligible value"),
      head: [bi("Ativo", "Asset"), bi("Valor", "Value"), bi("Haircut", "Haircut"), bi("Elegível", "Eligible"), bi("No pacote", "In package")],
      rows: c.lines.map((line) => [line.asset.description, money(line.asset.value, "pt-BR"), `${pct(line.haircut, "pt-BR")}${line.haircutSource === "policy" ? " (política)" : ""}`, money(line.eligible, "pt-BR"), line.selected ? "sim" : "não"]),
    });
    for (const note of c.notes) blocks.push({type: "paragraph", text: note});
  }
  return blocks;
}

/** The card at the top: what is being asked, on what basis, in ten seconds. */
function keyTerms(input: InstitutionalInput): MaterialBlock {
  const {desk, trajectory, termSheet} = input;
  const lm = trajectory?.liabilityManagement;
  const amount = termValue(termSheet, "amount");
  const tenor = termValue(termSheet, "tenor");
  const grace = termValue(termSheet, "grace");
  const pricing = termValue(termSheet, "pricing");
  const firstStep = trajectory?.covenantProposal[0];

  return {
    type: "callout",
    title: bi("Termos-chave", "Key terms"),
    items: [
      {label: bi("Tomadora", "Borrower"), value: bi(input.companyName ?? "Companhia (identidade sob autorização)", input.companyName ?? "Company (identity under authorisation)")},
      ...(amount ? [{label: amount.labels, value: amount.value}] : []),
      ...(lm
        ? [{
            label: bi("Destinação", "Use of proceeds"),
            value: bi(
              `${money(lm.covenantedBalance, "pt-BR")} quitação de linhas com covenant · ${money(lm.netNewMoney, "pt-BR")} recursos novos`,
              `${money(lm.covenantedBalance, "en-US")} covenanted-line takeout · ${money(lm.netNewMoney, "en-US")} new money`,
            ),
          }]
        : []),
      ...(tenor ? [{label: tenor.labels, value: tenor.value}] : []),
      ...(grace ? [{label: grace.labels, value: grace.value}] : []),
      ...(pricing ? [{label: pricing.labels, value: pricing.value}] : []),
      ...(input.rating ? [{label: bi("Perfil analítico indicativo", "Indicative analytical profile"), value: bi(`${input.rating.grade} de 10 (${({strong: "forte", adequate: "adequado", watch: "atenção", weak: "fraco", distressed: "crítico"})[input.rating.band]})`, `${input.rating.grade} of 10 (${input.rating.band})`)}] : []),
      {
        label: bi("Alavancagem pré / pós", "Leverage pre / post"),
        value: bi(
          `${turns(desk.leverage.preTurns, "pt-BR")} / ${lm ? turns(lm.postLeverageAfterRefi, "pt-BR") : "n/d"}`,
          `${turns(desk.leverage.preTurns, "en-US")} / ${lm ? turns(lm.postLeverageAfterRefi, "en-US") : "n/a"}`,
        ),
      },
      ...(firstStep
        ? [{
            label: bi("Covenant proposto (1º teste)", "Proposed covenant (first test)"),
            value: bi(`Dív. líq./EBITDA ≤ ${turns(firstStep.maximum, "pt-BR")} em ${firstStep.year}`, `Net debt/EBITDA ≤ ${turns(firstStep.maximum, "en-US")} in ${firstStep.year}`),
          }]
        : []),
    ],
  };
}

/** What every number in the document rests on, stated rather than implied. */
function basisOfPreparation(input: InstitutionalInput): MaterialBlock {
  const {desk, trajectory} = input;
  return {
    type: "callout",
    title: bi("Base de preparação", "Basis of preparation"),
    items: [
      {label: bi("Data de referência", "Reference date"), value: bi(desk.assumptions.referenceDate, desk.assumptions.referenceDate)},
      {label: bi("CDI assumido", "CDI assumed"), value: bi(`${pct(desk.assumptions.cdi, "pt-BR")} a.a.`, `${pct(desk.assumptions.cdi, "en-US")} p.a.`)},
      ...(trajectory
        ? [
            {label: bi("Cenário cortado", "Cut scenario"), value: bi(`${pct(trajectory.assumptions.growthHaircut, "pt-BR")} do crescimento projetado removido; base auditada preservada`, `${pct(trajectory.assumptions.growthHaircut, "en-US")} of projected growth removed; audited base preserved`)},
            {label: bi("Caixa", "Cash"), value: bi(`mantido constante em ${money(trajectory.assumptions.cashHeldFlat, "pt-BR")}`, `held flat at ${money(trajectory.assumptions.cashHeldFlat, "en-US")}`)},
            {label: bi("Folga do covenant", "Covenant cushion"), value: bi(`${turns(trajectory.assumptions.covenantCushion, "pt-BR")} sobre o cenário cortado, piso de 2,50x`, `${turns(trajectory.assumptions.covenantCushion, "en-US")} over the cut scenario, 2.50x floor`)},
          ]
        : []),
      {label: bi("Rastreabilidade", "Traceability"), value: bi("Todo número cita o documento, a página e a célula de origem; ver Fontes.", "Every number cites the source document, page and cell; see Sources.")},
    ],
  };
}

const briefSection = (brief: CaseBrief, id: string): MaterialBlock[] => {
  const section = brief.sections.find((entry) => entry.id === id);
  if (!section) return [];
  return section.claims.map((claim) => ({
    type: "paragraph" as const,
    text: bi(claim.text, claim.text),
    claimId: claim.id,
    ...(claim.supportIds.length > 0 ? {supportIds: claim.supportIds} : {}),
  }));
};

/**
 * The lender-facing credit memorandum, compiled from the governed case record.
 */
export function creditMemo(input: InstitutionalInput): Material {
  const {brief, desk, trajectory, exceptions, companyName} = input;
  const su = trajectory ? sourcesAndUses(desk, trajectory) : null;

  // The verdict, when there is one, is section 1 and everything shifts by it. A counter rather
  // than literals, because a memorandum whose sections jump from 3 to 5 was written carelessly
  // and the reader is entitled to read that as a warning about the numbers too.
  let section = 0;
  const n = (pt: string, en: string) => {
    section += 1;
    return bi(`${section}. ${pt}`, `${section}. ${en}`);
  };

  const blocks: MaterialBlock[] = [
    keyTerms(input),
    ...(input.verdict ? [{type: "heading" as const, text: n("Suportabilidade e alternativas", "Supportability and alternatives")}, ...verdictSection(input.verdict)] : []),
    {type: "heading", text: n("Sumário executivo", "Executive summary")},
    {type: "paragraph", text: bi(brief.executiveSummary, brief.executiveSummary)},

    {type: "heading", text: n("A operação", "The transaction")},
    ...briefSection(brief, "request"),
    ...(su ? [su] : []),

    {type: "heading", text: n("A companhia", "The company")},
    ...briefSection(brief, "identity"),
    ...briefSection(brief, "business"),

    {type: "heading", text: n("Desempenho histórico e posição atual", "Historical performance and current position")},
    ...briefSection(brief, "history"),
    ...briefSection(brief, "current_position"),

    {type: "heading", text: n("Estrutura de capital e tratamento", "Capital structure and treatment")},
    ...capitalStructure(desk, trajectory),

    ...(trajectory
      ? [
          {type: "heading" as const, text: n("Trajetória de alavancagem e covenant proposto", "Leverage trajectory and proposed covenant")},
          trajectoryTable(trajectory),
          covenantSchedule(trajectory),
        ]
      : []),

    {type: "heading", text: n("Projeções e projeto", "Projections and project")},
    ...briefSection(brief, "project"),
    ...briefSection(brief, "projections"),

    ...riskFactors(desk, trajectory).map((block, index) =>
      index === 0 && block.type === "heading" ? {...block, text: n("Fatores de risco e tratamento", "Risk factors and treatment")} : block,
    ),

    ...(exceptions.length > 0
      ? [
          {type: "heading" as const, text: n("Pontos em aberto", "Open points")},
          {type: "list" as const, items: exceptions.map((exception) => bi(exception.description, exception.description))},
        ]
      : []),

    ...(creditConsiderationsSection(input).length > 0
      ? [{type: "heading" as const, text: n("Principais considerações de crédito", "Key credit considerations")}, ...creditConsiderationsSection(input)]
      : []),

    {type: "heading", text: bi("Base de preparação", "Basis of preparation")},
    basisOfPreparation(input),
  ];

  return {
    kind: "credit_memo",
    // The company is the rendered subtitle; putting it in the title too prints it twice.
    title: bi("Memorando de Crédito", "Credit Memorandum"),
    blocks,
    dependsOn: [...input.calculations.map((calculation) => calculation.id), ...input.facts.map((fact) => fact.key.fieldPath)],
  };
}

/**
 * The term sheet: two columns, every term with its basis, a lawyer can mark it up.
 */
export function termSheetDocument(input: InstitutionalInput): Material | null {
  const {termSheet, desk, trajectory, companyName} = input;
  if (!termSheet) return null;
  const lm = trajectory?.liabilityManagement;

  const termRows = termSheet.terms.map((term) => ({
    label: term.labels,
    value: term.value,
    note: term.divergence
      ? bi(
          `${term.rationale.pt} A companhia pediu ${term.divergence.requested.pt}; ${term.divergence.reason.pt}`,
          `${term.rationale.en} The company asked for ${term.divergence.requested.en}; ${term.divergence.reason.en}`,
        )
      : term.rationale,
    supportIds: [] as string[],
  }));

  const covenantText = trajectory
    ? trajectory.covenantProposal.map((step) => `${step.year}: ≤ ${turns(step.maximum, "pt-BR")}`).join("; ")
    : null;

  const blocks: MaterialBlock[] = [
    {
      type: "callout",
      title: bi("Natureza deste documento", "Nature of this document"),
      items: [
        {label: bi("Status", "Status"), value: bi("Indicativo e não vinculante. Sujeito a diligência, aprovação de crédito e documentação definitiva.", "Indicative and non-binding. Subject to due diligence, credit approval and definitive documentation.")},
        {label: bi("Assessor", "Adviser"), value: bi("Offroad Capital, na qualidade de assessora da tomadora.", "Offroad Capital, as adviser to the borrower.")},
      ],
    },
    {type: "heading", text: bi("Partes e instrumento", "Parties and instrument")},
    {
      type: "kv",
      rows: [
        {label: bi("Tomadora", "Borrower"), value: bi(companyName ?? "Companhia (identidade divulgada mediante autorização)", companyName ?? "Company (identity disclosed upon authorisation)")},
        {label: bi("Investidores", "Investors"), value: bi("Fundos de crédito privado e investidores qualificados selecionados pela assessora.", "Private credit funds and qualified investors selected by the adviser.")},
      ],
    },
    {type: "heading", text: bi("Termos econômicos", "Economic terms")},
    {type: "kv", rows: termRows},
    ...(lm
      ? [{
          type: "kv" as const,
          caption: bi("Destinação dos recursos", "Use of proceeds"),
          rows: [
            lm.lendersTakenOut.length > 0
              ? {label: bi("Quitação de linhas com covenant", "Covenanted-line takeout"), value: bi(`${money(lm.covenantedBalance, "pt-BR")} (${lm.lendersTakenOut.join(", ")})`, `${money(lm.covenantedBalance, "en-US")} (${lm.lendersTakenOut.join(", ")})`), supportIds: ["trajetoria.linhas_com_covenant"]}
              : {label: bi("Resgate de dívida existente", "Repayment of existing debt"), value: bi(money(lm.covenantedBalance, "pt-BR"), money(lm.covenantedBalance, "en-US")), supportIds: ["trajetoria.linhas_com_covenant"]},
            {label: bi("Recursos novos para o plano", "New money for the plan"), value: bi(money(lm.netNewMoney, "pt-BR"), money(lm.netNewMoney, "en-US")), supportIds: ["trajetoria.dinheiro_novo_liquido"]},
          ],
        }]
      : []),
    {type: "heading", text: bi("Garantias", "Security")},
    {type: "list", items: termSheet.collateral.map((item) => bi(item, item))},
    {type: "heading", text: bi("Covenants financeiros", "Financial covenants")},
    {
      type: "kv",
      rows: [
        ...(covenantText
          ? [{label: bi("Dívida líquida / EBITDA", "Net debt / EBITDA"), value: bi(`${covenantText}. Teste anual sobre demonstrações auditadas; primeira aferição no primeiro exercício completo após o desembolso.`, `${covenantText}. Tested annually on audited statements; first test at the first full year after disbursement.`), supportIds: ["trajetoria.2026.alavancagem_cortada"]}]
          : []),
      ],
    },
    ...(termSheet.covenants.length > 0
      ? [
          {type: "paragraph" as const, text: bi("Demais covenants usuais para a estrutura, a calibrar na diligência:", "Further covenants customary for the structure, to be calibrated in diligence:")},
          {type: "list" as const, items: termSheet.covenants.map((item) => bi(item, item))},
        ]
      : []),
    // The clauses as an indenture writes them: definition, test and what a breach does. A term
    // sheet that names a ratio has named nothing a lawyer can mark up.
    {type: "heading", text: bi("Definições contratuais dos covenants", "Contractual definitions of the covenants")},
    {
      type: "kv",
      rows: covenantsFor(termSheet.archetypeId).map((covenant) => ({
        label: covenant.labels,
        value: covenant.definition,
        note: bi(`Aferição: ${covenant.test.pt} Descumprimento: ${covenant.breach.pt}${covenant.carveOuts.length ? ` Exceções: ${covenant.carveOuts.map((entry) => entry.pt).join(" ")}` : ""}`, `Test: ${covenant.test.en} Breach: ${covenant.breach.en}${covenant.carveOuts.length ? ` Carve-outs: ${covenant.carveOuts.map((entry) => entry.en).join(" ")}` : ""}`),
      })),
    },
    {type: "heading", text: bi("Condições precedentes", "Conditions precedent")},
    {
      type: "list",
      items: [
        // What the verdict found binding comes first: a condition the desk discovered and the
        // term sheet omits is a condition the borrower meets on the day of disbursement.
        ...(input.verdict?.conditions ?? []).map((condition) => ({pt: condition.pt, en: condition.en})),
        ...(lm ? [bi("Quitação das linhas indicadas e liberação formal das garantias a elas vinculadas, simultânea ao desembolso.", "Repayment of the indicated lines and formal release of their security, simultaneous with disbursement.")] : []),
        bi("Conclusão satisfatória de diligência contábil, jurídica e de garantias.", "Satisfactory completion of accounting, legal and security due diligence."),
        bi("Ausência de alteração adversa relevante entre a data de referência e o desembolso.", "No material adverse change between the reference date and disbursement."),
        bi("Aprovações societárias da tomadora e constituição das garantias.", "Corporate approvals of the borrower and perfection of security."),
      ],
    },
    {type: "heading", text: bi("Obrigações de informação", "Information undertakings")},
    {
      type: "list",
      items: [
        bi("Demonstrações financeiras auditadas anuais em até 120 dias do encerramento do exercício.", "Annual audited financial statements within 120 days of year end."),
        bi("Informações gerenciais trimestrais em até 45 dias do encerramento do trimestre.", "Quarterly management accounts within 45 days of quarter end."),
        bi("Certificado de conformidade com covenants a cada aferição, assinado pela diretoria financeira.", "Covenant compliance certificate at each test date, signed by the CFO."),
        bi("Comunicação imediata de qualquer evento que possa configurar vencimento antecipado.", "Immediate notice of any event that may constitute an event of default."),
      ],
    },
    {type: "heading", text: bi("Eventos de vencimento antecipado (indicativos)", "Events of default (indicative)")},
    {
      type: "list",
      items: [
        bi("Inadimplemento de principal ou juros não sanado em 5 dias úteis.", "Non-payment of principal or interest uncured within 5 business days."),
        bi("Descumprimento de covenant financeiro não sanado ou não renunciado em 30 dias.", "Financial covenant breach uncured or unwaived within 30 days."),
        bi("Vencimento antecipado cruzado de outras dívidas acima de limite a definir.", "Cross-acceleration of other debt above a threshold to be agreed."),
        bi("Mudança de controle sem anuência prévia dos investidores.", "Change of control without prior investor consent."),
        bi("Declaração falsa relevante nas informações prestadas.", "Material misrepresentation in the information provided."),
      ],
    },
    {type: "disclaimer", text: termSheet.disclaimer},
  ];

  return {
    kind: "term_sheet",
    title: bi("Term Sheet indicativo", "Indicative Term Sheet"),
    blocks,
    dependsOn: [...input.calculations.map((calculation) => calculation.id), ...input.facts.map((fact) => fact.key.fieldPath)],
  };
}
