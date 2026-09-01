import type {CaseState} from "./case-pipeline";

type Locale = "pt" | "en";

const money = (value: string | null | undefined, locale: Locale, currency: string) => {
  if (value === null || value === undefined || value === "") return locale === "pt" ? "Não informado" : "Not provided";
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return value;
  return new Intl.NumberFormat(locale === "pt" ? "pt-BR" : "en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(parsed);
};

const text = (locale: Locale, pt: string, en: string) => locale === "pt" ? pt : en;
const lines = (items: readonly string[], locale: Locale) => items.length ? items.map((item) => `- ${item}`) : [text(locale, "- Nenhum.", "- None.")];

/** A readable, portable diagnosis compiled from the exact governed case state on screen. */
export function caseDiagnosisMarkdown(input: {state: CaseState; locale: Locale; title: string; currency?: string | null}) {
  const {state, locale, title} = input;
  const brief = state.brief;
  const financial = state.reconciliation.financialTruth;
  const debt = state.reconciliation.debtTruth;
  const operation = state.operationTruth;
  const currency = input.currency || "BRL";
  const questions = state.clientQuestions.map((question) => locale === "pt" ? question.pt : question.en);
  const exceptions = state.reconciliation.exceptions.map((exception) => `${exception.title}: ${exception.description}`);
  const gaps = state.reconciliation.gaps.map((gap) => `${gap.title}: ${gap.description}`);
  const output: string[] = [
    `# ${title}`,
    "",
    `> ${text(locale, "Case de trabalho para revisão da companhia. Não é parecer de crédito, underwriting, proposta de financiador ou autorização de distribuição.", "Working case for company review. It is not a credit opinion, underwriting, a lender proposal or distribution authorisation.")}`,
    "",
    `## ${text(locale, "1. Resumo executivo", "1. Executive summary")}`,
    "",
    brief?.executiveSummary ?? text(locale, "O resumo permanece bloqueado até que todas as afirmações materiais estejam suportadas.", "The summary remains blocked until every material statement is supported."),
    "",
  ];

  for (const section of brief?.sections ?? []) {
    if (section.id === "executive_summary") continue;
    output.push(`### ${section.heading}`, "");
    for (const claim of section.claims) {
      const support = claim.supportIds.length ? ` [${claim.supportIds.join(", ")}]` : "";
      output.push(`- ${claim.text}${support}`);
    }
    output.push("");
  }

  output.push(
    `## ${text(locale, "2. Histórico financeiro", "2. Financial history")}`,
    "",
    `| ${text(locale, "Período", "Period")} | ${text(locale, "Receita", "Revenue")} | EBITDA ${text(locale, "ajustado", "adjusted")} | ${text(locale, "Margem", "Margin")} | CFADS |`,
    "|---|---:|---:|---:|---:|",
  );
  if (financial.statements.length) {
    for (const statement of financial.statements) {
      const revenue = statement.lines.find((line) => line.metric === "revenue")?.value;
      const margin = statement.ebitdaMargin === null ? text(locale, "N/D", "N/A") : `${(Number(statement.ebitdaMargin) * 100).toLocaleString(locale === "pt" ? "pt-BR" : "en-US", {maximumFractionDigits: 1})}%`;
      output.push(`| ${statement.period} | ${money(revenue, locale, currency)} | ${money(statement.adjustedEbitda, locale, currency)} | ${margin} | ${money(statement.cfads, locale, currency)} |`);
    }
  } else output.push(`| ${text(locale, "Sem demonstrações conciliadas", "No reconciled statements")} |  |  |  |  |`);

  output.push(
    "",
    `## ${text(locale, "3. Endividamento e liquidez", "3. Debt and liquidity")}`,
    "",
    `- ${text(locale, "Dívida financeira bruta", "Gross financial debt")}: ${money(debt.views.grossFinancialDebt, locale, currency)}`,
    `- ${text(locale, "Dívida financeira líquida", "Net financial debt")}: ${money(debt.views.netFinancialDebt, locale, currency)}`,
    `- ${text(locale, "Serviço nos próximos 12 meses", "Debt service over the next 12 months")}: ${money(debt.serviceNext12Months, locale, currency)}`,
    `- ${text(locale, "Exposições fora do balanço", "Off-balance-sheet exposures")}: ${money(debt.views.offBalanceSheetExposures, locale, currency)}`,
    "",
  );
  for (const instrument of debt.instruments) {
    output.push(`- ${instrument.lender ?? text(locale, "Credor não informado", "Lender not provided")} | ${instrument.instrument ?? text(locale, "instrumento não informado", "instrument not provided")} | ${money(instrument.balance, locale, instrument.currency ?? currency)} | ${instrument.maturity ?? text(locale, "vencimento não informado", "maturity not provided")}`);
  }

  output.push(
    "",
    `## ${text(locale, "4. Necessidade de capital e impacto", "4. Capital need and impact")}`,
    "",
    `- ${text(locale, "Montante solicitado", "Requested amount")}: ${money(operation.request.amount, locale, currency)}`,
    `- ${text(locale, "Necessidade calculada", "Calculated need")}: ${money(operation.calculatedNeed?.value, locale, currency)}`,
    `- ${text(locale, "Total de fontes", "Total sources")}: ${money(operation.sourcesAndUses.totalSources, locale, currency)}`,
    `- ${text(locale, "Total de usos", "Total uses")}: ${money(operation.sourcesAndUses.totalUses, locale, currency)}`,
    `- ${text(locale, "Diferença entre fontes e usos", "Sources and uses difference")}: ${money(operation.sourcesAndUses.difference, locale, currency)}`,
    `- ${text(locale, "Dívida líquida pró-forma", "Pro forma net debt")}: ${money(operation.proForma?.netDebt, locale, currency)}`,
    "",
  );

  if (state.capacity) {
    output.push(
      `## ${text(locale, "5. Capacidade indicativa", "5. Indicative capacity")}`,
      "",
      `- ${text(locale, "Pedido", "Request")}: ${money(state.capacity.requested, locale, currency)}`,
      `- ${text(locale, "Capacidade recomendada", "Recommended capacity")}: ${money(state.capacity.recommended, locale, currency)}`,
      `- ${text(locale, "Restrição vinculante", "Binding constraint")}: ${state.capacity.bindingConstraint ?? text(locale, "Não determinada", "Not determined")}`,
      "",
      ...state.capacity.walls.map((wall) => `- ${wall.labels[locale]}: ${money(wall.amount, locale, currency)}. ${wall.explanation[locale]}`),
      "",
    );
  }

  if (state.trajectory) {
    output.push(
      `## ${text(locale, "6. Business plan e trajetória de alavancagem", "6. Business plan and leverage trajectory")}`,
      "",
      `| ${text(locale, "Ano", "Year")} | EBITDA base | EBITDA stress | ${text(locale, "Dívida líquida", "Net debt")} | ${text(locale, "Alavancagem base", "Base leverage")} | ${text(locale, "Alavancagem stress", "Stressed leverage")} |`,
      "|---|---:|---:|---:|---:|---:|",
      ...state.trajectory.years.map((year) => `| ${year.year} | ${money(year.ebitdaBase, locale, currency)} | ${money(year.ebitdaStressed, locale, currency)} | ${money(year.netDebt, locale, currency)} | ${year.leverageBase}x | ${year.leverageStressed}x |`),
      "",
    );
  }

  output.push(
    `## ${text(locale, "7. Divergências e lacunas", "7. Discrepancies and gaps")}`,
    "",
    ...lines(exceptions, locale),
    ...lines(gaps, locale),
    "",
    `## ${text(locale, "8. Perguntas para fechar a análise", "8. Questions required to complete the analysis")}`,
    "",
    ...lines(questions, locale),
    "",
    `## ${text(locale, "9. Limite desta versão", "9. Boundary of this version")}`,
    "",
    text(locale, "A estrutura, o term sheet indicativo, o modelo financeiro entregável e os materiais institucionais serão produzidos somente depois da confirmação deste case e da direção de estrutura.", "The structure, indicative term sheet, deliverable financial model and institutional materials will be produced only after this case and the structuring direction are confirmed."),
    "",
  );
  return output.join("\n");
}
