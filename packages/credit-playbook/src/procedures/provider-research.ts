export const providerResearchCriterionLabels: Record<string, [string, string]> = {
  ticket_min: ["Investimento mínimo", "Minimum investment"], ticket_max: ["Investimento máximo", "Maximum investment"], term_months_min: ["Prazo mínimo em meses", "Minimum term in months"], term_months_max: ["Prazo máximo em meses", "Maximum term in months"],
  ticket: ["Faixa de investimento", "Investment range"], term_months: ["Prazo em meses", "Term in months"], sectors: ["Setores", "Sectors"], instruments: ["Instrumentos", "Instruments"], structure_types: ["Instrumentos", "Instruments"], collateral: ["Garantias", "Security"], geographies: ["Geografias", "Geographies"], leverage_ceiling: ["Limite de alavancagem", "Leverage ceiling"], minimum_dscr: ["Cobertura mínima do serviço da dívida", "Minimum debt-service coverage"], active: ["Atividade declarada", "Reported activity"],
};

export function providerResearchCoverageGaps(observations: ReadonlyArray<{observedAt: string | null}>, asOf: string, locale: "pt-BR" | "en-US", sourceClass: "directory" | "registered" = "registered"): string[] {
  const pt = locale === "pt-BR";
  return [
      ...(sourceClass === "directory" ? [pt ? "Os critérios do diretório não foram incluídos nesta pesquisa; somente sua identificação foi consultada." : "Directory criteria were not included in this research; only its identity was consulted."] : observations.length ? [] : [pt ? "Não há critérios de mandato registrados." : "No mandate criteria are recorded."]),
      ...(observations.some(item => item.observedAt === null) ? [pt ? "Há informações sem data de observação." : "Some information has no observation date."] : []),
      ...(observations.some(item => item.observedAt !== null && Date.parse(item.observedAt) > Date.parse(asOf)) ? [pt ? `${observations.filter(item => item.observedAt !== null && Date.parse(item.observedAt) > Date.parse(asOf)).length} observações posteriores à data de referência foram excluídas da leitura.` : `${observations.filter(item => item.observedAt !== null && Date.parse(item.observedAt) > Date.parse(asOf)).length} observations after the reference date were excluded from the readout.`] : []),
      pt ? "Interesse atual, capacidade disponível e adequação a uma operação não foram verificados." : "Current appetite, available capacity and suitability for a transaction were not verified.",
    ];
}
