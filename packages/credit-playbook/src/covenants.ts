/**
 * The covenants a Brazilian private-credit indenture actually carries, as data a lawyer can
 * mark up.
 *
 * A term sheet that lists "dívida líquida / EBITDA" has named a ratio, not a covenant. A
 * covenant is the ratio, its accounting definition (what counts as debt, which EBITDA, which
 * period), how often it is tested and on what statements, what happens when it is breached
 * (cure period, waiver, step-up, acceleration), and the carve-outs. Writing the ten usual
 * ones down once means every term sheet says the same thing the same way, and a desk that
 * disagrees changes one line.
 */

export type CovenantId =
  | "net_leverage"
  | "interest_coverage"
  | "dscr"
  | "minimum_cash"
  | "minimum_arr"
  | "additional_debt"
  | "restricted_payments"
  | "change_of_control"
  | "cross_default"
  | "information";

export type CovenantKind = "financial" | "negative" | "event" | "information";

export type CovenantDefinition = {
  id: CovenantId;
  kind: CovenantKind;
  labels: {pt: string; en: string};
  /** The accounting definition the indenture writes, so two parties read one number. */
  definition: {pt: string; en: string};
  /** How often it is tested and on what. */
  test: {pt: string; en: string};
  /** What happens on breach: cure, waiver, step-up, acceleration. */
  breach: {pt: string; en: string};
  /** The usual carve-outs. */
  carveOuts: {pt: string; en: string}[];
  /** Archetypes where the covenant is customary. */
  usual: readonly string[];
};

const bi = (pt: string, en: string) => ({pt, en});

export const covenantCatalogue: readonly CovenantDefinition[] = [
  {
    id: "net_leverage", kind: "financial",
    labels: bi("Dívida líquida / EBITDA", "Net debt / EBITDA"),
    definition: bi("Dívida líquida: empréstimos, financiamentos, debêntures, notas e arrendamentos financeiros (IFRS 16 excluído ou incluído conforme acordado, declarado aqui), mais derivativos passivos líquidos, menos caixa, equivalentes e aplicações financeiras de liquidez imediata. EBITDA: lucro operacional antes de resultado financeiro, IR/CSLL, depreciação e amortização, dos últimos doze meses, ajustado apenas por itens não recorrentes listados na escritura com teto anual.", "Net debt: loans, financings, debentures, notes and finance leases (IFRS 16 excluded or included as agreed, stated here), plus net derivative liabilities, less cash, equivalents and immediately liquid financial investments. EBITDA: operating profit before financial result, income taxes, depreciation and amortisation, over the last twelve months, adjusted only for non-recurring items listed in the indenture with an annual cap."),
    test: bi("Trimestral sobre ITR revisado e anual sobre demonstrações auditadas, no prazo de 45 dias do fechamento; primeira aferição no primeiro trimestre completo após o desembolso.", "Quarterly on reviewed interim statements and annually on audited statements, within 45 days of the close; first test on the first full quarter after disbursement."),
    breach: bi("Cura de 30 dias por aporte de capital ou redução de dívida (equity cure, no máximo duas vezes na vida do papel, não consecutivas); waiver por assembleia de credores com quórum de 2/3; na falta, vencimento antecipado declarável por maioria.", "30-day cure by equity injection or debt reduction (equity cure, at most twice over the life of the paper, not consecutive); waiver by a creditors' meeting with a two-thirds quorum; failing that, acceleration declarable by majority."),
    carveOuts: [bi("Dívida subordinada aos credores do papel fora da dívida líquida.", "Debt subordinated to the paper's creditors excluded from net debt."), bi("Aquisições: EBITDA pro forma dos últimos doze meses da adquirida.", "Acquisitions: pro forma last-twelve-months EBITDA of the target.")],
    usual: ["growth_expansion", "working_capital", "refinance", "acquisition", "equipment_finance"],
  },
  {
    id: "interest_coverage", kind: "financial",
    labels: bi("EBITDA / despesa financeira líquida", "EBITDA / net interest expense"),
    definition: bi("Despesa financeira líquida: juros incorridos sobre a dívida (competência), menos receitas financeiras de aplicações, excluindo variação cambial e marcação de derivativos.", "Net interest expense: interest accrued on debt, less financial income from investments, excluding foreign exchange variation and derivative marking."),
    test: bi("Trimestral, acumulado de doze meses.", "Quarterly, on a trailing twelve-month basis."),
    breach: bi("Cura de 30 dias; waiver por 2/3; step-up de remuneração de 50 bps enquanto descumprido, se assim negociado.", "30-day cure; waiver by two-thirds; a 50 bps remuneration step-up while in breach, where so negotiated."),
    carveOuts: [bi("Juros capitalizados em obra fora da despesa até a entrada em operação.", "Interest capitalised during construction excluded until the asset enters operation.")],
    usual: ["growth_expansion", "refinance", "acquisition"],
  },
  {
    id: "dscr", kind: "financial",
    labels: bi("Índice de cobertura do serviço da dívida (DSCR)", "Debt service coverage ratio (DSCR)"),
    definition: bi("Caixa disponível para o serviço da dívida (EBITDA menos IR/CSLL pagos, menos capex de manutenção, mais ou menos variação do capital de giro) dividido pelo serviço da dívida (principal mais juros pagos) do período.", "Cash available for debt service (EBITDA less income taxes paid, less maintenance capex, plus or minus working capital change) over debt service (principal plus interest paid) in the period."),
    test: bi("Anual sobre auditado, a partir do primeiro exercício completo após a carência.", "Annually on audited statements, from the first full year after grace."),
    breach: bi("Retenção de caixa em conta vinculada (cash sweep) até recomposição; vencimento antecipado se abaixo do piso por dois testes consecutivos.", "Cash trapped in a blocked account (cash sweep) until restored; acceleration if below the floor on two consecutive tests."),
    carveOuts: [bi("Capex de expansão financiado por equity fora do cálculo.", "Expansion capex funded by equity excluded from the calculation.")],
    usual: ["growth_expansion", "equipment_finance"],
  },
  {
    id: "minimum_cash", kind: "financial",
    labels: bi("Caixa mínimo", "Minimum cash"),
    definition: bi("Caixa, equivalentes e aplicações de liquidez imediata em contas da emissora, aferidos no último dia do mês; para empresa em queima, expresso em meses de queima líquida média dos últimos três meses.", "Cash, equivalents and immediately liquid investments in the issuer's accounts, measured on the last day of the month; for a cash-burning company, expressed as months of the last three months' average net burn."),
    test: bi("Mensal, por declaração do diretor financeiro com extratos; trimestral conferido no ITR.", "Monthly, by the CFO's certificate with bank statements; quarterly checked against the interim statements."),
    breach: bi("Cura de 15 dias por aporte; abaixo do piso por 30 dias, vencimento antecipado declarável.", "15-day cure by injection; below the floor for 30 days, acceleration declarable."),
    carveOuts: [bi("Caixa restrito de garantias e depósitos judiciais fora da conta.", "Restricted cash for security and judicial deposits excluded.")],
    usual: ["venture_debt", "working_capital"],
  },
  {
    id: "minimum_arr", kind: "financial",
    labels: bi("ARR mínimo", "Minimum ARR"),
    definition: bi("Receita recorrente anualizada: MRR contratado do último mês do trimestre vezes doze, excluindo serviços, implantação e contratos em aviso de cancelamento.", "Annualised recurring revenue: contracted MRR of the quarter's last month times twelve, excluding services, implementation and contracts under cancellation notice."),
    test: bi("Trimestral, sobre export por cliente assinado pelo diretor financeiro; piso com folga de 20% sobre o plano.", "Quarterly, on the per-customer export signed by the CFO; floor at 20% below plan."),
    breach: bi("Renegociação do cronograma com step-up de 100 bps; dois trimestres abaixo do piso, vencimento antecipado declarável.", "Schedule renegotiation with a 100 bps step-up; two quarters below the floor, acceleration declarable."),
    carveOuts: [],
    usual: ["venture_debt"],
  },
  {
    id: "additional_debt", kind: "negative",
    labels: bi("Limitação de nova dívida", "Limitation on additional debt"),
    definition: bi("Sem nova dívida financeira, garantia a terceiros ou arrendamento acima de um cesto anual (tipicamente 10% do EBITDA ou valor fixo), salvo refinanciamento de dívida existente em condições iguais ou melhores e dívida subordinada.", "No new financial debt, third-party guarantee or lease above an annual basket (typically 10% of EBITDA or a fixed amount), except refinancing of existing debt on equal or better terms and subordinated debt."),
    test: bi("Permanente; declaração trimestral.", "Continuous; quarterly certificate."),
    breach: bi("Cura por quitação da dívida não autorizada em 30 dias; na falta, vencimento antecipado.", "Cure by repaying the unauthorised debt within 30 days; failing that, acceleration."),
    carveOuts: [bi("Linhas de capital de giro rotativas até o limite declarado na escritura.", "Revolving working-capital lines up to the limit stated in the indenture."), bi("Financiamento de equipamento com alienação do próprio bem.", "Equipment financing secured on the asset itself.")],
    usual: ["growth_expansion", "working_capital", "refinance", "acquisition", "equipment_finance", "venture_debt"],
  },
  {
    id: "restricted_payments", kind: "negative",
    labels: bi("Limitação de dividendos e pagamentos a sócios", "Limitation on dividends and payments to shareholders"),
    definition: bi("Dividendos, juros sobre capital próprio, redução de capital, recompra e mútuos a sócios limitados ao mínimo legal obrigatório enquanto a alavancagem estiver acima do patamar acordado ou qualquer covenant estiver descumprido.", "Dividends, interest on equity, capital reductions, buybacks and shareholder loans limited to the legal minimum while leverage is above the agreed level or any covenant is in breach."),
    test: bi("Permanente; verificado a cada distribuição.", "Continuous; checked at each distribution."),
    breach: bi("Devolução do valor distribuído em 30 dias; na falta, vencimento antecipado.", "Return of the amount distributed within 30 days; failing that, acceleration."),
    carveOuts: [bi("Dividendo mínimo obrigatório por lei ou estatuto.", "Minimum mandatory dividend by law or bylaws.")],
    usual: ["growth_expansion", "working_capital", "refinance", "acquisition", "equipment_finance", "venture_debt"],
  },
  {
    id: "change_of_control", kind: "event",
    labels: bi("Mudança de controle", "Change of control"),
    definition: bi("Alteração do controle acionário direto ou indireto, ou saída dos fundadores da gestão em empresa de venture debt, sem anuência prévia dos credores.", "Change in direct or indirect controlling shareholding, or the founders leaving management in a venture-debt company, without the creditors' prior consent."),
    test: bi("Evento.", "Event."),
    breach: bi("Direito de resgate antecipado pelo credor (put) ao par mais prêmio acordado.", "Creditor's early redemption right (put) at par plus an agreed premium."),
    carveOuts: [bi("Reorganizações dentro do mesmo grupo econômico sem alteração do controlador final.", "Reorganisations within the same economic group without change of ultimate controller.")],
    usual: ["growth_expansion", "working_capital", "refinance", "acquisition", "equipment_finance", "venture_debt"],
  },
  {
    id: "cross_default", kind: "event",
    labels: bi("Vencimento antecipado cruzado", "Cross-default and cross-acceleration"),
    definition: bi("Inadimplemento ou vencimento antecipado de outra dívida da emissora ou de controlada relevante acima de um valor de materialidade (tipicamente 2% do patrimônio líquido ou valor fixo).", "Default or acceleration of other debt of the issuer or a material subsidiary above a materiality threshold (typically 2% of equity or a fixed amount)."),
    test: bi("Evento; comunicação em 2 dias úteis.", "Event; notice within 2 business days."),
    breach: bi("Vencimento antecipado automático acima do limiar; declarável abaixo dele.", "Automatic acceleration above the threshold; declarable below it."),
    carveOuts: [bi("Dívida em disputa de boa-fé com garantia depositada.", "Debt under good-faith dispute with security deposited.")],
    usual: ["growth_expansion", "working_capital", "refinance", "acquisition", "equipment_finance", "venture_debt"],
  },
  {
    id: "information", kind: "information",
    labels: bi("Obrigações de informação", "Information undertakings"),
    definition: bi("Demonstrações auditadas em 120 dias do encerramento; ITR ou gerencial trimestral em 45 dias; certificado de conformidade com cálculo dos covenants a cada aferição; comunicação imediata de evento que possa configurar vencimento antecipado.", "Audited statements within 120 days of year-end; quarterly interim or management statements within 45 days; compliance certificate with the covenant calculations at each test; immediate notice of any event that may constitute acceleration."),
    test: bi("Por prazo.", "By deadline."),
    breach: bi("Cura de 15 dias; persistindo, descumprimento declarável.", "15-day cure; persisting, a declarable breach."),
    carveOuts: [],
    usual: ["growth_expansion", "working_capital", "refinance", "acquisition", "equipment_finance", "venture_debt"],
  },
];

export function covenantsFor(archetypeId: string): CovenantDefinition[] {
  return covenantCatalogue.filter((covenant) => covenant.usual.includes(archetypeId));
}
