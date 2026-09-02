import {
  compileDebtResearchStrategy,
  inferDebtJurisdiction,
  type DebtResearchStrategy,
  type DebtResearchWork,
  type PublicSearchProvider,
} from "@offroad/public-research";

const sourceIdByProvider: Partial<Record<PublicSearchProvider["id"], string>> = {
  perplexity: "perplexity",
  openai: "openai_web_search",
};

export function compileWorkerDebtResearchStrategy(input: {
  work: DebtResearchWork;
  locale: "pt-BR" | "en-US";
  website?: string;
  geography?: string;
  providers: PublicSearchProvider[];
  evidenceBasis: DebtResearchStrategy["evidenceBasis"];
}): {strategy: DebtResearchStrategy; jurisdictionNeedsConfirmation: boolean; jurisdictionBasis: string} {
  const inference = inferDebtJurisdiction({
    locale: input.locale,
    ...(input.website ? {website: input.website} : {}),
    ...(input.geography ? {geography: input.geography} : {}),
  });
  const activatedSourceIds = input.providers.flatMap((provider) => {
    const sourceId = sourceIdByProvider[provider.id];
    return sourceId ? [sourceId] : [];
  });
  return {
    strategy: compileDebtResearchStrategy({
      work: input.work,
      jurisdiction: inference.jurisdiction,
      evidenceBasis: input.evidenceBasis,
      activatedSourceIds,
    }),
    jurisdictionNeedsConfirmation: inference.needsConfirmation,
    jurisdictionBasis: inference.basis,
  };
}
