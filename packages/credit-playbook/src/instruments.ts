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

export type InstrumentId =
  | "ccb"
  | "nce"
  | "debenture_476"
  | "debenture_160"
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
    tax: bi("IOF de crédito sobre o principal (0,38% fixo mais 0,0082% ao dia, limitado a 365 dias); juros dedutíveis para a tomadora.", "Credit IOF on principal (0.38% flat plus 0.0082% a day, capped at 365 days); interest deductible for the borrower."),
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
    tax: bi("Isenta de IOF de crédito; exige comprovação do vínculo com exportação.", "Exempt from credit IOF; requires evidence of the export link."),
    requirements: [bi("Histórico ou contratos de exportação compatíveis com o montante.", "Export history or contracts consistent with the amount.")],
    archetypes: ["working_capital", "growth_expansion"],
  },
  {
    id: "debenture_476",
    labels: bi("Debênture com esforços restritos (CVM 160, antiga 476)", "Debenture, restricted efforts (CVM 160, formerly 476)"),
    description: bi("Título de dívida de sociedade anônima colocado junto a investidores profissionais, sem registro prévio; o papel padrão do mercado de capitais para dívida corporativa.", "Corporate bond of a sociedade anônima placed with professional investors without prior registration; the capital markets' standard corporate debt paper."),
    legalForms: ["sa"],
    minimumAmount: "30000000",
    tenorMonths: {min: 24, max: 120},
    spreadOverCdiBps: {min: 120, max: 450},
    setupCostPct: "0.012",
    buyers: ["fundos de crédito", "bancos (tesouraria)", "family offices", "seguradoras"],
    tax: bi("Sem IOF de crédito; IR do investidor pela tabela regressiva (22,5% a 15%), salvo debênture de infraestrutura (Lei 12.431), isenta para pessoa física.", "No credit IOF; investor income tax on the regressive table (22.5% to 15%), except infrastructure debentures (Law 12.431), exempt for individuals."),
    requirements: [bi("Sociedade anônima com estatuto que autorize a emissão e deliberação societária.", "Sociedade anônima whose bylaws allow the issue, with a corporate resolution."), bi("Escritura, agente fiduciário, banco liquidante, registro na B3; demonstrações auditadas.", "Indenture, trustee, settlement bank, B3 registration; audited statements."), bi("Até 75 investidores profissionais procurados e 50 subscritores.", "Up to 75 professional investors approached and 50 subscribers.")],
    archetypes: ["growth_expansion", "refinance", "acquisition", "working_capital"],
  },
  {
    id: "debenture_160",
    labels: bi("Debênture com registro automático (CVM 160, amplo)", "Debenture, automatic registration (CVM 160, broad)"),
    description: bi("Oferta ampla a qualquer investidor, com prospecto e maior custo; faz sentido acima de algumas centenas de milhões.", "Broad offer to any investor, with a prospectus and a higher cost; makes sense above a few hundred million."),
    legalForms: ["sa"],
    minimumAmount: "300000000",
    tenorMonths: {min: 36, max: 144},
    spreadOverCdiBps: {min: 100, max: 350},
    setupCostPct: "0.018",
    buyers: ["fundos", "pessoas físicas", "institucionais"],
    tax: bi("Como a restrita; infraestrutura isenta para pessoa física.", "As the restricted one; infrastructure exempt for individuals."),
    requirements: [bi("Companhia aberta registrada na CVM, prospecto, coordenador líder.", "CVM-registered public company, prospectus, lead coordinator.")],
    archetypes: ["refinance", "growth_expansion", "acquisition"],
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
    tax: bi("Rendimento isento de IR para pessoa física; sem IOF; lastro precisa ser crédito do agronegócio nos termos da Lei 11.076 e da Resolução CMN 5.118.", "Income-tax exempt for individuals; no IOF; the backing must be agribusiness credit under Law 11.076 and CMN Resolution 5.118."),
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
    tax: bi("Rendimento isento de IR para pessoa física; lastro imobiliário conforme Lei 9.514 e Resolução CMN 5.118.", "Income-tax exempt for individuals; real estate backing under Law 9.514 and CMN Resolution 5.118."),
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
    tax: bi("Sem IOF de crédito na cessão; IR sobre o rendimento das cotas para o investidor.", "No credit IOF on the assignment; investor income tax on the quotas' yield."),
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
    tax: bi("Normalmente CCB ou debênture conversível/com warrant; IOF como CCB quando cédula.", "Usually a CCB or a convertible/warrant debenture; IOF as a CCB when a note."),
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
    tax: bi("IOF de crédito; custo em TLP mais remuneração do BNDES e do agente.", "Credit IOF; cost in TLP plus BNDES and agent remuneration."),
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
    tax: bi("Sem IOF de crédito; contraprestações dedutíveis; contabilizado como passivo de arrendamento (IFRS 16).", "No credit IOF; instalments deductible; booked as a lease liability (IFRS 16)."),
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
