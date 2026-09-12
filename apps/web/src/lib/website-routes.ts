import type {AppLocale} from "@/i18n/routing";

export const publicRoutes = {
  home: ["", ""],
  solutions: ["solucoes", "solutions"],
  strategy: ["solucoes/estrategia-de-capital", "solutions/capital-strategy"],
  execution: ["solucoes/analise-modelos-e-materiais", "solutions/analysis-models-and-materials"],
  intelligence: ["solucoes/inteligencia-e-conexao", "solutions/capital-intelligence"],
  audiences: ["para-quem", "who-its-for"],
  companies: ["para-quem/companhias", "who-its-for/companies"],
  advisors: ["para-quem/assessores", "who-its-for/advisors"],
  investors: ["para-quem/alocadores-e-financiadores", "who-its-for/allocators-and-lenders"],
  cases: ["casos-de-uso", "use-cases"],
  growth: ["casos-de-uso/financiar-o-crescimento", "use-cases/financing-growth"],
  terms: ["casos-de-uso/comparar-propostas", "use-cases/comparing-offers"],
  pitch: ["casos-de-uso/preparar-a-abordagem", "use-cases/preparing-a-pitch"],
  credit: ["casos-de-uso/analisar-o-credito", "use-cases/credit-assessment"],
  investment: ["casos-de-uso/formar-uma-visao-propria", "use-cases/independent-investment-view"],
  monitoring: ["casos-de-uso/reavaliar-a-posicao", "use-cases/reassessing-a-position"],
  about: ["sobre", "about"],
  security: ["seguranca", "security"],
  demo: ["demonstracao", "request-demo"],
  privacy: ["privacidade", "privacy"],
  legal: ["termos", "terms"],
} as const;

export type PublicPage = keyof typeof publicRoutes;
export const publicPages = Object.keys(publicRoutes) as PublicPage[];
export function publicPath(locale: AppLocale, page: PublicPage) {
  const slug = publicRoutes[page][locale === "pt-BR" ? 0 : 1];
  return `/${locale}${slug ? `/${slug}` : ""}`;
}
export function resolvePublicPage(locale: AppLocale, segments: string[]) {
  return publicPages.find((page) => publicPath(locale, page) === `/${locale}/${segments.join("/")}`);
}
