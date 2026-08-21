import Decimal from "decimal.js";
import type {CaseBrief} from "@offroad/case-understanding";
import type {DeskAnalysis, Trajectory} from "@offroad/credit-analysis";
import type {IndicativeTermSheet} from "@offroad/deal-structure";
import type {ReconciledFact, ReconciliationException, TracedCalculation} from "@offroad/reconciliation";

import type {Material, MaterialBlock} from "./compile";
import {capitalStructure, covenantSchedule, riskFactors, sourcesAndUses, trajectoryTable} from "./desk-sections";

/**
 * The two documents a DCM house actually circulates: the investment memorandum and the term sheet.
 *
 * The package that existed before was a credit profile with a term table appended. A desk
 * circulates something more specific. The memorandum opens with the key terms on one card, so
 * a portfolio manager knows in ten seconds what is being asked and on what basis, and then
 * builds the case in the order a committee reads it: the transaction, the company, the numbers,
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
};

const termValue = (termSheet: IndicativeTermSheet | undefined, id: string) =>
  termSheet?.terms.find((term) => term.id === id);

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
    ...(claim.supportIds.length > 0 ? {supportIds: claim.supportIds} : {}),
  }));
};

/**
 * The investment memorandum, in the order a committee reads it.
 */
export function investmentMemo(input: InstitutionalInput): Material {
  const {brief, desk, trajectory, exceptions, companyName} = input;
  const su = trajectory ? sourcesAndUses(desk, trajectory) : null;

  const blocks: MaterialBlock[] = [
    keyTerms(input),
    {type: "heading", text: bi("1. Sumário executivo", "1. Executive summary")},
    {type: "paragraph", text: bi(brief.executiveSummary, brief.executiveSummary)},

    {type: "heading", text: bi("2. A operação", "2. The transaction")},
    ...briefSection(brief, "request"),
    ...(su ? [su] : []),

    {type: "heading", text: bi("3. A companhia", "3. The company")},
    ...briefSection(brief, "identity"),
    ...briefSection(brief, "business"),

    {type: "heading", text: bi("4. Desempenho histórico e posição atual", "4. Historical performance and current position")},
    ...briefSection(brief, "history"),
    ...briefSection(brief, "current_position"),

    {type: "heading", text: bi("5. Estrutura de capital e tratamento", "5. Capital structure and treatment")},
    ...capitalStructure(desk, trajectory),

    ...(trajectory
      ? [
          {type: "heading" as const, text: bi("6. Trajetória de alavancagem e covenant proposto", "6. Leverage trajectory and proposed covenant")},
          trajectoryTable(trajectory),
          covenantSchedule(trajectory),
        ]
      : []),

    {type: "heading", text: bi("7. Projeções e projeto", "7. Projections and project")},
    ...briefSection(brief, "project"),
    ...briefSection(brief, "projections"),

    ...riskFactors(desk, trajectory).map((block, index) =>
      index === 0 && block.type === "heading" ? {...block, text: bi("8. Fatores de risco e tratamento", "8. Risk factors and treatment")} : block,
    ),

    ...(exceptions.length > 0
      ? [
          {type: "heading" as const, text: bi("9. Pontos em aberto", "9. Open points")},
          {type: "list" as const, items: exceptions.map((exception) => bi(exception.description, exception.description))},
        ]
      : []),

    {type: "heading", text: bi("Base de preparação", "Basis of preparation")},
    basisOfPreparation(input),
  ];

  return {
    kind: "investment_memo",
    // The company is the rendered subtitle; putting it in the title too prints it twice.
    title: bi("Investment Memorandum", "Investment Memorandum"),
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
            {label: bi("Quitação de linhas com covenant", "Covenanted-line takeout"), value: bi(`${money(lm.covenantedBalance, "pt-BR")} (${lm.lendersTakenOut.join(", ")})`, `${money(lm.covenantedBalance, "en-US")} (${lm.lendersTakenOut.join(", ")})`), supportIds: ["trajetoria.linhas_com_covenant"]},
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
    {type: "heading", text: bi("Condições precedentes", "Conditions precedent")},
    {
      type: "list",
      items: [
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
