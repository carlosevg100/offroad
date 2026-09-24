import type {TransactionRoute} from "@offroad/credit-ontology";

import {routeForLegacyInstrument} from "./taxonomy";
import type {ArchetypeId} from "./types";

/**
 * The instruments a Brazilian private-credit desk actually places, as data a banker can
 * disagree with.
 *
 * An archetype says what the money is for; an instrument says what paper carries it, who may
 * issue it, what it costs to set up, how it is taxed, and what the law requires. The two are
 * different questions, and the product answered only the first. A limitada cannot issue a
 * debenture; a CRA needs agribusiness receivables as backing; a CRI needs real estate; a FIDC
 * needs a receivables base worth securitising; venture debt needs equity sponsors behind it.
 * Telling a company which papers its profile admits, and why the others are closed, is the
 * first structuring sentence a desk says.
 */

/**
 * `debenture_476` is a legacy storage key. Stored pricing observations (the check constraint of
 * `pricing_observations.instrument`), stored structure proposals and the fingerprints bound to their
 * decisions, the Case 01 v4 executor snapshot and the Rede Horizonte gold carry it, so the key stays.
 * The paper it names is the debenture offered to professional investors under the automatic rite of
 * Resolução CVM 160/2022, which revoked ICVM 476 from 02/01/2023; none of the ICVM 476 rules apply.
 */
export type InstrumentId =
  | "ccb"
  | "nce"
  | "debenture_476"
  | "debenture_160"
  | "nota_comercial"
  | "cra"
  | "cri"
  | "fidc"
  | "venture_debt"
  | "finame"
  | "leasing";

export type LegalForm = "sa" | "ltda" | "other";

export type IssuerProfile = {
  legalForm: LegalForm;
  archetypeId: ArchetypeId;
  /** Requested amount in reais, as a decimal string. */
  amount: string;
  /** Whether the company's revenue is predominantly agribusiness (producer, cooperative, agro trade). */
  agribusiness?: boolean;
  /** Whether the use of proceeds is real estate (construction, acquisition, or backed by property receivables). */
  realEstate?: boolean;
  /** Whether an equity sponsor (venture fund) is on the cap table. */
  ventureBacked?: boolean;
  /** Whether the proceeds buy identifiable equipment or vehicles. */
  equipment?: boolean;
  /** Whether the company has a receivables base large enough to securitise (as a fraction of the ask). */
  receivablesCoverage?: string;
  /** Whether the proceeds fund exports. */
  exports?: boolean;
};

export type OfferAudience = "professional" | "qualified" | "general_public";

/**
 * How a security the company itself issues reaches investors under Resolução CVM 160/2022, in force
 * since 02/01/2023. It revoked ICVM 400 and ICVM 476, and with ICVM 476 the caps of 75 investors
 * approached and 50 subscribers. The audience decides whether the issuer must be registered with the
 * CVM; the registration rite follows from the issuer and the audience.
 */
export type OfferRegime = {
  rule: "cvm_160";
  rite: "automatic" | "automatic_or_ordinary";
  audiences: readonly OfferAudience[];
  issuerRegistrationRequired: boolean;
};

/**
 * Credit IOF on the company's side under Decreto 6.306/2007, as amended through 2025: the general
 * rate (0,0082% a day capped at 365 days plus 0,38%, art. 7º), an exemption (art. 9º), a zero rate
 * (art. 8º), not levied (securities, leases and receivables assignments sit outside the credit IOF),
 * or depends on the paper when the route uses more than one.
 */
export type CreditIof = "general_rate" | "exempt" | "zero_rate" | "not_levied" | "depends_on_paper";

export type Instrument = {
  id: InstrumentId;
  labels: {pt: string; en: string};
  description: {pt: string; en: string};
  /** Who may issue it. */
  legalForms: readonly LegalForm[];
  /** Smallest ticket that makes the set-up cost worth it, in reais. */
  minimumAmount: string;
  /** Typical tenor range in months. */
  tenorMonths: {min: number; max: number};
  /** Typical all-in cost band over CDI, in basis points, before the warrant or guarantee. */
  spreadOverCdiBps: {min: number; max: number};
  /** Structuring, registration and agent costs, as a fraction of the amount, typical. */
  setupCostPct: string;
  /** Who buys this paper. */
  buyers: readonly string[];
  /** Tax treatment the company and the investor read first. */
  tax: {pt: string; en: string};
  /** Credit IOF the company pays on this paper. */
  creditIof: CreditIof;
  /**
   * Offer regime of a security the company itself issues (debentures and the nota comercial).
   * Absent for bilateral credit, leases, development-bank lines, venture debt, whose paper varies,
   * and paper a securitisation company or a fund issues (CRA, CRI, FIDC quotas).
   */
  offerRegime?: OfferRegime;
  /** What the law and the market require before it exists. */
  requirements: {pt: string; en: string}[];
  /** The archetypes this paper usually serves. */
  archetypes: readonly ArchetypeId[];
};

const bi = (pt: string, en: string) => ({pt, en});

export const instruments: readonly Instrument[] = [
  {
    id: "ccb",
    labels: bi("Cédula de Crédito Bancário (CCB)", "Bank credit note (CCB)"),
    description: bi("Empréstimo bilateral formalizado em cédula, com banco ou fundo como credor; o papel mais rápido de fechar.", "A bilateral loan formalised as a note, with a bank or a fund as creditor; the fastest paper to close."),
    legalForms: ["sa", "ltda", "other"],
    minimumAmount: "2000000",
    tenorMonths: {min: 12, max: 60},
    spreadOverCdiBps: {min: 250, max: 700},
    setupCostPct: "0.005",
    buyers: ["bancos", "fundos de crédito via cessão", "FIDCs"],
    tax: bi("IOF de crédito na liberação: 0,0082% ao dia sobre o principal de cada parcela, limitado a 365 dias, mais 0,38% fixo, até 3,373% do principal (Decreto 6.306/2007, art. 7º); juros dedutíveis no lucro real.", "Credit IOF at disbursement: 0.0082% a day on each instalment's principal, capped at 365 days, plus 0.38% flat, up to 3.373% of principal (Decree 6,306/2007, art. 7); interest deductible under lucro real."),
    creditIof: "general_rate",
    requirements: [bi("Garantias registradas (alienação ou cessão fiduciária) quando o perfil exige.", "Registered security (fiduciary lien or assignment) when the profile requires it."), bi("Sem registro na CVM; circulação por endosso ou cessão.", "No CVM registration; circulates by endorsement or assignment.")],
    archetypes: ["working_capital", "growth_expansion", "refinance", "equipment_finance", "other"],
  },
  {
    id: "nce",
    labels: bi("Nota de Crédito à Exportação (NCE)", "Export credit note (NCE)"),
    description: bi("Crédito bancário para financiar produção destinada à exportação, isento de IOF.", "Bank credit to fund export-bound production, IOF-exempt."),
    legalForms: ["sa", "ltda", "other"],
    minimumAmount: "5000000",
    tenorMonths: {min: 12, max: 48},
    spreadOverCdiBps: {min: 150, max: 450},
    setupCostPct: "0.004",
    buyers: ["bancos"],
    tax: bi("Isenta de IOF de crédito (Decreto 6.306/2007, art. 9º); a isenção exige comprovação do vínculo com exportação.", "Exempt from credit IOF (Decree 6,306/2007, art. 9); the exemption requires evidence of the export link."),
    creditIof: "exempt",
    requirements: [bi("Histórico ou contratos de exportação compatíveis com o montante.", "Export history or contracts consistent with the amount.")],
    archetypes: ["working_capital", "growth_expansion"],
  },
  {
    id: "debenture_476",
    labels: bi("Debênture para investidor profissional (CVM 160, rito automático)", "Debenture for professional investors (CVM 160, automatic rite)"),
    description: bi("Título de dívida de sociedade anônima, aberta ou fechada, ofertado a investidores profissionais pelo rito de registro automático da Resolução CVM 160, sem registro da emissora na CVM; o papel padrão do mercado de capitais para dívida corporativa.", "Corporate bond of a sociedade anônima, listed or not, offered to professional investors under the automatic registration rite of CVM Resolution 160, without the issuer's registration with the CVM; the capital markets' standard corporate debt paper."),
    legalForms: ["sa"],
    minimumAmount: "30000000",
    tenorMonths: {min: 24, max: 120},
    spreadOverCdiBps: {min: 120, max: 450},
    setupCostPct: "0.012",
    buyers: ["fundos de crédito", "bancos (tesouraria)", "family offices", "seguradoras"],
    tax: bi("Sem IOF de crédito para a emissora e IOF sobre títulos a zero para o investidor (Decreto 6.306/2007, arts. 2º e 32); IR do investidor pela tabela regressiva (22,5% a 15%), salvo debênture incentivada (Lei 12.431), isenta para pessoa física. Na debênture de infraestrutura (Lei 14.801) o benefício é da emissora, que exclui do lucro real mais 30% dos juros, e o investidor é tributado normalmente.", "No credit IOF for the issuer and a zero IOF rate on securities for the investor (Decree 6,306/2007, arts. 2 and 32); investor income tax on the regressive table (22.5% to 15%), except incentivised debentures (Law 12,431), exempt for individuals. In an infrastructure debenture (Law 14,801) the benefit is the issuer's, which excludes a further 30% of interest from taxable profit, and the investor is taxed normally."),
    creditIof: "not_levied",
    offerRegime: {rule: "cvm_160", rite: "automatic", audiences: ["professional"], issuerRegistrationRequired: false},
    requirements: [bi("Sociedade anônima, aberta ou fechada, com estatuto que autorize a emissão e aprovação do órgão competente.", "Sociedade anônima, listed or not, whose bylaws allow the issue, approved by the competent corporate body."), bi("Escritura, agente fiduciário, banco liquidante, registro na B3; demonstrações auditadas.", "Indenture, trustee, settlement bank, B3 registration; audited statements."), bi("Rito de registro automático da Resolução CVM 160 para investidor profissional, sem limite de investidores procurados ou de subscritores; sem registro da emissora na CVM, a revenda fica restrita a investidor profissional e a negociação ao mercado de balcão.", "Automatic registration rite of CVM Resolution 160 for professional investors, with no cap on investors approached or subscribers; without the issuer's CVM registration, resale is restricted to professional investors and trading to the over-the-counter market.")],
    archetypes: ["growth_expansion", "refinance", "acquisition", "working_capital"],
  },
  {
    id: "debenture_160",
    labels: bi("Debênture para investidor qualificado ou público em geral (CVM 160)", "Debenture for qualified investors or the general public (CVM 160)"),
    description: bi("Oferta a investidor qualificado ou ao público em geral, que exige emissora registrada na CVM; custo e prazo de preparação maiores, faz sentido acima de algumas centenas de milhões.", "An offer to qualified investors or the general public, which requires a CVM-registered issuer; a higher cost and a longer preparation, it makes sense above a few hundred million."),
    legalForms: ["sa"],
    minimumAmount: "300000000",
    tenorMonths: {min: 36, max: 144},
    spreadOverCdiBps: {min: 100, max: 350},
    setupCostPct: "0.018",
    buyers: ["fundos", "pessoas físicas", "institucionais"],
    tax: bi("Como a debênture para investidor profissional: sem IOF de crédito para a emissora; incentivada (Lei 12.431) isenta para pessoa física; na de infraestrutura (Lei 14.801) o benefício é da emissora.", "As the professional-investor debenture: no credit IOF for the issuer; incentivised debentures (Law 12,431) exempt for individuals; in an infrastructure debenture (Law 14,801) the benefit is the issuer's."),
    creditIof: "not_levied",
    offerRegime: {rule: "cvm_160", rite: "automatic_or_ordinary", audiences: ["qualified", "general_public"], issuerRegistrationRequired: true},
    requirements: [bi("Emissora registrada na CVM (companhia aberta); coordenador líder e documentos da oferta, com prospecto e lâmina quando o rito e o público os exigirem.", "Issuer registered with the CVM (public company); a lead coordinator and the offer documents, with a prospectus and a summary sheet when the rite and the audience require them.")],
    archetypes: ["refinance", "growth_expansion", "acquisition"],
  },
  {
    // Ticket, tenor, spread and set-up are the professional-investor debenture's practice values:
    // the two share the offer regime, the buyers and most of the set-up. They stand until the founder
    // states the note's own values; the governed pricing registry holds no nota comercial yet.
    id: "nota_comercial",
    labels: bi("Nota comercial (Lei 14.195/2021)", "Commercial note (Law 14,195/2021)"),
    description: bi("Título de dívida escritural que sociedade anônima, limitada ou cooperativa emite, ofertado a investidores profissionais pelo rito de registro automático da Resolução CVM 160; é a rota de mercado de capitais da limitada, que não emite debênture.", "A book-entry debt security that a sociedade anônima, a limitada or a cooperative issues, offered to professional investors under the automatic registration rite of CVM Resolution 160; it is the capital-markets route for a limitada, which cannot issue debentures."),
    legalForms: ["sa", "ltda"],
    minimumAmount: "30000000",
    tenorMonths: {min: 24, max: 120},
    spreadOverCdiBps: {min: 120, max: 450},
    setupCostPct: "0.012",
    buyers: ["fundos de crédito", "bancos (tesouraria)", "family offices"],
    tax: bi("Sem IOF de crédito para a emissora; IOF sobre títulos pela tabela regressiva de 30 dias, do lado do investidor (Decreto 6.306/2007, art. 32); IR do investidor pela tabela regressiva (22,5% a 15%).", "No credit IOF for the issuer; IOF on securities on the 30-day regressive table, on the investor's side (Decree 6,306/2007, art. 32); investor income tax on the regressive table (22.5% to 15%)."),
    creditIof: "not_levied",
    offerRegime: {rule: "cvm_160", rite: "automatic", audiences: ["professional"], issuerRegistrationRequired: false},
    requirements: [bi("Sociedade anônima, limitada ou cooperativa, com aprovação dos órgãos de administração ou do administrador (Lei 14.195/2021, arts. 45 a 51).", "Sociedade anônima, limitada or cooperative, approved by the management bodies or the administrator (Law 14,195/2021, arts. 45 to 51)."), bi("Emissão escritural por instituição autorizada pela CVM a escriturar; agente fiduciário quando a CVM exigir.", "Book-entry issue through an institution the CVM authorises to keep the register; a trustee when the CVM requires one."), bi("Rito de registro automático da Resolução CVM 160 para investidor profissional, sem limite de investidores procurados ou de subscritores.", "Automatic registration rite of CVM Resolution 160 for professional investors, with no cap on investors approached or subscribers.")],
    archetypes: ["growth_expansion", "refinance", "acquisition", "working_capital"],
  },
  {
    id: "cra",
    labels: bi("Certificado de Recebíveis do Agronegócio (CRA)", "Agribusiness receivables certificate (CRA)"),
    description: bi("Securitização de crédito do agronegócio por uma securitizadora; o investidor pessoa física é isento de IR, o que barateia o papel para o emissor agro.", "Securitisation of agribusiness credit by a securitisation company; individual investors are income-tax exempt, which makes the paper cheaper for an agribusiness issuer."),
    legalForms: ["sa", "ltda"],
    minimumAmount: "50000000",
    tenorMonths: {min: 24, max: 120},
    spreadOverCdiBps: {min: 50, max: 300},
    setupCostPct: "0.015",
    buyers: ["pessoas físicas (isenção)", "fundos", "bancos"],
    tax: bi("Rendimento isento de IR para pessoa física (Lei 11.033/2004, art. 3º); sem IOF de crédito para a devedora do lastro e IOF sobre títulos a zero; lastro precisa ser crédito do agronegócio nos termos da Lei 11.076 e da Resolução CMN 5.118.", "Income-tax exempt for individuals (Law 11,033/2004, art. 3); no credit IOF for the debtor of the backing and a zero IOF rate on securities; the backing must be agribusiness credit under Law 11,076 and CMN Resolution 5,118."),
    creditIof: "not_levied",
    requirements: [bi("Lastro agro: produtor, cooperativa, ou empresa cuja receita decorra da cadeia do agronegócio, conforme a regra vigente.", "Agribusiness backing: producer, cooperative, or a company whose revenue comes from the agribusiness chain, per the current rule."), bi("Securitizadora, agente fiduciário, termo de securitização, registro na B3.", "Securitisation company, trustee, securitisation term, B3 registration.")],
    archetypes: ["working_capital", "growth_expansion", "refinance"],
  },
  {
    id: "cri",
    labels: bi("Certificado de Recebíveis Imobiliários (CRI)", "Real estate receivables certificate (CRI)"),
    description: bi("Securitização de crédito imobiliário; mesma isenção do CRA, para quem tem imóvel ou recebível imobiliário como lastro.", "Securitisation of real estate credit; the same exemption as the CRA, for issuers with property or property receivables as backing."),
    legalForms: ["sa", "ltda"],
    minimumAmount: "30000000",
    tenorMonths: {min: 36, max: 180},
    spreadOverCdiBps: {min: 80, max: 350},
    setupCostPct: "0.015",
    buyers: ["pessoas físicas (isenção)", "fundos imobiliários", "bancos"],
    tax: bi("Rendimento isento de IR para pessoa física (Lei 11.033/2004, art. 3º); sem IOF de crédito para a devedora do lastro e IOF sobre títulos a zero; lastro imobiliário conforme Lei 9.514 e Resolução CMN 5.118.", "Income-tax exempt for individuals (Law 11,033/2004, art. 3); no credit IOF for the debtor of the backing and a zero IOF rate on securities; real estate backing under Law 9,514 and CMN Resolution 5,118."),
    creditIof: "not_levied",
    requirements: [bi("Lastro imobiliário: aluguéis, construção, aquisição ou alienação fiduciária de imóvel.", "Real estate backing: rents, construction, acquisition or fiduciary lien on property."), bi("Securitizadora, agente fiduciário, laudo de avaliação do imóvel.", "Securitisation company, trustee, property appraisal report.")],
    archetypes: ["growth_expansion", "refinance"],
  },
  {
    id: "fidc",
    labels: bi("Fundo de Investimento em Direitos Creditórios (FIDC)", "Receivables investment fund (FIDC)"),
    description: bi("Venda de recebíveis a um fundo que emite cotas; o crédito é da carteira, não da empresa, e o custo acompanha a qualidade dos sacados.", "Sale of receivables to a fund that issues quotas; the credit is the portfolio's, not the company's, and the cost follows the obligors' quality."),
    legalForms: ["sa", "ltda", "other"],
    minimumAmount: "20000000",
    tenorMonths: {min: 12, max: 60},
    spreadOverCdiBps: {min: 200, max: 600},
    setupCostPct: "0.02",
    buyers: ["cotistas seniores (fundos, bancos)", "a própria empresa na cota subordinada"],
    tax: bi("Sem IOF de crédito na cessão; IOF de 0,38% na aquisição primária de cotas, pago pelo cotista (Decreto 6.306/2007, art. 32-D); IR sobre o rendimento das cotas para o investidor.", "No credit IOF on the assignment; 0.38% IOF on the primary acquisition of quotas, paid by the quota holder (Decree 6,306/2007, art. 32-D); investor income tax on the quotas' yield."),
    creditIof: "not_levied",
    requirements: [bi("Base de recebíveis pulverizada e auditável, com histórico de perdas.", "A diversified, auditable receivables base with a loss history."), bi("Administrador, gestor, custodiante e auditor do fundo; cota subordinada da empresa.", "Fund administrator, manager, custodian and auditor; the company's subordinated quota.")],
    archetypes: ["working_capital"],
  },
  {
    id: "venture_debt",
    labels: bi("Venture debt", "Venture debt"),
    description: bi("Dívida para empresa financiada por equity que ainda não gera caixa; prazo curto, juros-só na carência, warrant no preço.", "Debt for an equity-funded company that does not yet generate cash; short tenor, interest-only during grace, a warrant in the price."),
    legalForms: ["sa", "ltda"],
    minimumAmount: "5000000",
    tenorMonths: {min: 18, max: 48},
    spreadOverCdiBps: {min: 500, max: 1200},
    setupCostPct: "0.01",
    buyers: ["fundos de venture debt", "braços de crédito de gestoras"],
    tax: bi("Normalmente CCB, debênture com bônus de subscrição ou mútuo conversível; IOF de crédito na CCB e no mútuo, sem IOF de crédito na debênture.", "Usually a CCB, a debenture with subscription warrants or a convertible loan; credit IOF on the CCB and the loan, none on the debenture."),
    creditIof: "depends_on_paper",
    requirements: [bi("Investidor de equity institucional no cap table e rodada recente.", "An institutional equity investor on the cap table and a recent round."), bi("Métricas de receita recorrente por cliente e runway demonstrado.", "Per-customer recurring revenue metrics and demonstrated runway.")],
    archetypes: ["venture_debt"],
  },
  {
    id: "finame",
    labels: bi("FINAME / BNDES indireto", "FINAME / indirect BNDES"),
    description: bi("Financiamento de máquinas e equipamentos nacionais credenciados, repassado por banco, com custo subsidiado e prazo longo.", "Financing of accredited domestic machinery and equipment, passed through a bank, at a subsidised cost and long tenor."),
    legalForms: ["sa", "ltda", "other"],
    minimumAmount: "500000",
    tenorMonths: {min: 24, max: 120},
    spreadOverCdiBps: {min: -200, max: 200},
    setupCostPct: "0.003",
    buyers: ["bancos repassadores"],
    tax: bi("Alíquota zero de IOF de crédito em operação com recursos da FINAME (Decreto 6.306/2007, art. 8º), com a fonte identificada no contrato do agente; sem essa evidência, vale a alíquota geral. Custo em TLP mais remuneração do BNDES e do agente.", "Zero credit IOF rate on operations funded by FINAME (Decree 6,306/2007, art. 8), with the source identified in the agent's contract; without that evidence the general rate applies. Cost in TLP plus BNDES and agent remuneration."),
    creditIof: "zero_rate",
    requirements: [bi("Equipamento credenciado no BNDES com índice de nacionalização.", "BNDES-accredited equipment with the required domestic content."), bi("Alienação fiduciária do bem financiado.", "Fiduciary lien on the financed asset.")],
    archetypes: ["equipment_finance", "growth_expansion"],
  },
  {
    id: "leasing",
    labels: bi("Arrendamento mercantil (leasing)", "Finance lease"),
    description: bi("O arrendador compra o bem e o cede em contraprestações; a propriedade é a garantia.", "The lessor buys the asset and leases it against instalments; ownership is the security."),
    legalForms: ["sa", "ltda", "other"],
    minimumAmount: "300000",
    tenorMonths: {min: 24, max: 60},
    spreadOverCdiBps: {min: 200, max: 600},
    setupCostPct: "0.003",
    buyers: ["sociedades de arrendamento (bancos)"],
    tax: bi("Sem IOF de crédito (Decreto 6.306/2007, art. 3º, § 3º); contraprestações dedutíveis; contabilizado como passivo de arrendamento (IFRS 16).", "No credit IOF (Decree 6,306/2007, art. 3, § 3); instalments deductible; booked as a lease liability (IFRS 16)."),
    creditIof: "not_levied",
    requirements: [bi("Bem identificável e revendável; prazo mínimo legal conforme a vida útil.", "An identifiable, resellable asset; legal minimum tenor by useful life.")],
    archetypes: ["equipment_finance"],
  },
];

export type InstrumentVerdict = {
  instrument: Instrument;
  /** Orthogonal economic interpretation of the legacy commercial route. */
  route: TransactionRoute;
  eligible: boolean;
  /** Why it is open or closed for this issuer, in one sentence each. */
  reasons: {pt: string; en: string}[];
};

/**
 * Which papers this issuer may place, and why each of the others is closed.
 *
 * Eligibility is a property of the issuer and the use, never of appetite: a limitada cannot
 * issue a debenture whatever its numbers, a CRA needs agribusiness credit behind it, a FIDC
 * needs receivables worth selling. The verdicts are meant to be read, so a closed door says
 * what would open it.
 */
export function instrumentVerdicts(profile: IssuerProfile): InstrumentVerdict[] {
  const amount = Number(profile.amount);
  return instruments.map((instrument) => {
    const reasons: {pt: string; en: string}[] = [];
    let eligible = true;
    if (!instrument.legalForms.includes(profile.legalForm)) {
      eligible = false;
      reasons.push(bi(`Exige ${instrument.legalForms.map((form) => ({sa: "sociedade anônima", ltda: "limitada", other: "outra forma"})[form]).join(" ou ")}; a companhia é ${({sa: "sociedade anônima", ltda: "limitada", other: "de outra forma"})[profile.legalForm]}.`, `Requires ${instrument.legalForms.join(" or ")}; the company is ${profile.legalForm}.`));
    }
    if ((instrument.id === "debenture_476" || instrument.id === "debenture_160") && profile.legalForm === "ltda") {
      reasons.push(bi("A limitada não emite debênture; a nota comercial e a CCB são as rotas equivalentes.", "A limitada cannot issue debentures; the commercial note and the CCB are the equivalent routes."));
    }
    if (instrument.id === "nota_comercial" && profile.legalForm === "other") {
      reasons.push(bi("A cooperativa também emite nota comercial; confirmada essa forma societária, a rota se abre.", "A cooperative may also issue a commercial note; once that legal form is confirmed, the route opens."));
    }
    if (amount < Number(instrument.minimumAmount)) {
      eligible = false;
      reasons.push(bi(`Abaixo do tíquete mínimo em que o custo de estruturação compensa (R$ ${(Number(instrument.minimumAmount) / 1e6).toFixed(0)} milhões).`, `Below the minimum ticket at which the set-up cost pays (R$ ${(Number(instrument.minimumAmount) / 1e6).toFixed(0)} million).`));
    }
    if (instrument.id === "cra" && !profile.agribusiness) {
      eligible = false;
      reasons.push(bi("Sem lastro do agronegócio: a receita da companhia não decorre da cadeia agro.", "No agribusiness backing: the company's revenue does not come from the agribusiness chain."));
    }
    if (instrument.id === "cri" && !profile.realEstate) {
      eligible = false;
      reasons.push(bi("Sem lastro imobiliário na destinação ou nas garantias.", "No real estate backing in the use of proceeds or the security."));
    }
    if (instrument.id === "nce" && !profile.exports) {
      eligible = false;
      reasons.push(bi("Sem vínculo com exportação.", "No export link."));
    }
    if (instrument.id === "fidc" && (profile.receivablesCoverage === undefined || Number(profile.receivablesCoverage) < 1.2)) {
      eligible = false;
      reasons.push(bi("Base de recebíveis abaixo de 1,2x o pedido; um FIDC precisa de carteira para vender.", "Receivables base under 1.2x the ask; a FIDC needs a portfolio to sell."));
    }
    if (instrument.id === "venture_debt" && !profile.ventureBacked) {
      eligible = false;
      reasons.push(bi("Sem investidor institucional de equity no cap table.", "No institutional equity investor on the cap table."));
    }
    if ((instrument.id === "finame" || instrument.id === "leasing") && !profile.equipment) {
      eligible = false;
      reasons.push(bi("A destinação não é bem identificável (máquina, veículo, equipamento).", "The use of proceeds is not an identifiable asset (machine, vehicle, equipment)."));
    }
    if (!instrument.archetypes.includes(profile.archetypeId)) {
      reasons.push(bi("Papel pouco usual para esta operação; possível, mas fora da prática.", "Unusual paper for this operation; possible, but outside practice."));
    }
    if (eligible && reasons.length === 0) reasons.push(bi("Elegível pela forma societária, pelo tíquete e pela destinação.", "Eligible by legal form, ticket and use."));
    return {instrument, route: routeForLegacyInstrument(instrument.id, profile), eligible, reasons};
  });
}
