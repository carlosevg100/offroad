import {
  compileDebtResearchStrategy,
  inferDebtJurisdiction,
  type DebtResearchStrategy,
  type DebtResearchWork,
  type PublicResearchSubject,
  type PublicSearchProvider,
} from "@offroad/public-research";

const sourceIdByProvider: Partial<Record<PublicSearchProvider["id"], string>> = {
  perplexity: "perplexity",
  openai: "openai_web_search",
};

export type WorkerOfficialResearchProviderFactory = (input: {
  jurisdiction: "BR" | "US";
  subject: PublicResearchSubject;
}) => PublicSearchProvider;

export function prepareWorkerDebtResearch(input: {
  work: DebtResearchWork;
  locale: "pt-BR" | "en-US";
  subject: PublicResearchSubject;
  discoveryProviders: PublicSearchProvider[];
  officialProviderFactory?: WorkerOfficialResearchProviderFactory | undefined;
  evidenceBasis: DebtResearchStrategy["evidenceBasis"];
}): {
  providers: PublicSearchProvider[];
  strategy: DebtResearchStrategy;
  jurisdictionNeedsConfirmation: boolean;
  jurisdictionBasis: string;
} {
  const inference = inferDebtJurisdiction({
    locale: input.locale,
    ...(input.subject.website ? {website: input.subject.website} : {}),
    ...(input.subject.geography ? {geography: input.subject.geography} : {}),
  });
  const official = inference.jurisdiction === "BR" || inference.jurisdiction === "US"
    ? input.officialProviderFactory?.({jurisdiction: inference.jurisdiction, subject: input.subject})
    : undefined;
  const providers = [...(official ? [official] : []), ...input.discoveryProviders];
  const strategy = compileWorkerDebtResearchStrategy({
    work: input.work,
    locale: input.locale,
    ...(input.subject.website ? {website: input.subject.website} : {}),
    ...(input.subject.geography ? {geography: input.subject.geography} : {}),
    providers,
    evidenceBasis: input.evidenceBasis,
  });
  return {...strategy, providers};
}

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
