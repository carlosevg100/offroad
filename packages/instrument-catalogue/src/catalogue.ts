import Decimal from "decimal.js";

import type {Eligibility, Instrument, InstrumentProfile, IssuerProfile} from "./types";

/**
 * The catalogue. Fifteen instruments, each with what makes it impossible rather than merely
 * unattractive, and pros and cons written the way a banker would say them out loud.
 *
 * The `cons` are the point of this file. Any vendor page lists advantages; what a company cannot
 * find anywhere is somebody saying plainly that becoming an S.A. to reach the debenture market
 * costs it audited statements forever, or that assigning receivables to an FIDC removes the
 * collateral it was going to offer the next lender. Those sentences are the product.
 */

const L = (pt: string, en: string) => ({pt, en});

const requiresLegalForm = (forms: readonly string[], why: {pt: string; en: string}): Eligibility => ({
  id: "legal_form",
  labels: L("Forma societária", "Legal form"),
  test: (issuer) => forms.includes(issuer.legalForm),
  whenUnmet: why,
});

const flag = (
  id: string,
  labels: {pt: string; en: string},
  read: (issuer: IssuerProfile) => boolean | undefined,
  whenUnmet: {pt: string; en: string},
): Eligibility => ({id, labels, test: (issuer) => read(issuer) === true, whenUnmet});

const atLeast = (amount: string, whenUnmet: {pt: string; en: string}): Eligibility => ({
  id: "minimum_size",
  labels: L("Porte mínimo", "Minimum size"),
  // An unstated amount does not fail the test: we do not exclude an instrument because the
  // company has not told us how much it wants yet.
  test: (issuer) => (issuer.amount === undefined ? true : new Decimal(issuer.amount).gte(amount)),
  whenUnmet,
});

export const catalogue: readonly InstrumentProfile[] = [
  // ---- the company issues -------------------------------------------------------------------
  {
    id: "debenture",
    labels: L("Debênture", "Debenture"),
    issuerRole: "issues",
    what: L(
      "Título de dívida emitido pela própria companhia e comprado por fundos e investidores. É o instrumento clássico do mercado de capitais brasileiro.",
      "A debt security issued by the company itself and bought by funds and investors. The classic Brazilian capital markets instrument.",
    ),
    legalBasis: "Lei 6.404/1976, art. 52 e seguintes; oferta pública sob a Resolução CVM 160",
    eligibility: [
      requiresLegalForm(
        ["sa_aberta", "sa_fechada"],
        L(
          "Só sociedade anônima emite debênture (art. 52 da Lei 6.404/76). Uma Ltda. precisaria se transformar em S.A. antes, o que é uma decisão societária com custo, prazo e obrigações contábeis permanentes.",
          "Only a sociedade anônima may issue a debenture (art. 52, Lei 6.404/76). A limitada would have to convert first, which is a corporate decision with cost, time and permanent accounting obligations.",
        ),
      ),
      atLeast(
        "20000000",
        L(
          "Abaixo de R$ 20 milhões os custos fixos da emissão (agente fiduciário, escriturador, registro, assessores) pesam demais sobre o valor captado.",
          "Below R$ 20 million the fixed costs of issuance (trustee, registrar, registration, advisers) weigh too heavily on the amount raised.",
        ),
      ),
    ],
    reaches: [
      L("Fundos de crédito privado", "Private credit funds"),
      L("Bancos e tesourarias", "Banks and treasuries"),
      L("Seguradoras e fundos de pensão", "Insurers and pension funds"),
      L("Investidores qualificados e, conforme o rito, o varejo", "Qualified investors and, depending on the rite, retail"),
    ],
    parties: [
      L("Agente fiduciário", "Trustee"),
      L("Escriturador e liquidante", "Registrar and settlement agent"),
      L("Assessor legal dos dois lados", "Legal counsel on both sides"),
      L("Coordenador, quando houver distribuição", "Coordinator, when there is a distribution"),
    ],
    pros: [
      L("Alcança o conjunto mais amplo de compradores, o que costuma significar prazo maior e custo menor.", "Reaches the widest set of buyers, which usually means longer tenor and lower cost."),
      L("Permite estruturar séries com prazos e garantias diferentes na mesma emissão.", "Allows series with different tenors and security inside one issuance."),
      L("Emissão bem-sucedida cria histórico: a segunda é mais barata e mais rápida que a primeira.", "A successful issuance creates a track record: the second is cheaper and faster than the first."),
    ],
    cons: [
      L("Exige ser S.A., e virar S.A. traz auditoria, conselho e publicações que não acabam quando a dívida acaba.", "Requires being an S.A., and becoming one brings audit, a board and publications that do not end when the debt does."),
      L("Escritura é um contrato longo, com covenants e vencimento antecipado negociados linha a linha.", "The indenture is a long contract, with covenants and acceleration negotiated line by line."),
      L("Prazo de montagem em semanas, não dias. Não serve para necessidade de caixa imediata.", "Weeks to assemble, not days. It does not serve an immediate cash need."),
    ],
    economicFloor: {
      amount: "20000000",
      note: L("Faixa em que os custos fixos deixam de dominar.", "The range where fixed costs stop dominating."),
    },
    weeksToFunding: {min: 8, max: 20},
  },
  {
    id: "debenture_incentivada",
    labels: L("Debênture incentivada", "Incentivised debenture"),
    issuerRole: "issues",
    what: L(
      "Debênture emitida para financiar projeto de infraestrutura, com isenção de imposto de renda para o investidor pessoa física, o que reduz a taxa que a companhia paga.",
      "A debenture issued to fund an infrastructure project, income-tax exempt for individual investors, which lowers the rate the company pays.",
    ),
    legalBasis: "Lei 12.431/2011; enquadramento do projeto por portaria do ministério setorial",
    eligibility: [
      requiresLegalForm(
        ["sa_aberta", "sa_fechada"],
        L("Vale a mesma regra da debênture comum: só sociedade anônima emite.", "The same rule as an ordinary debenture: only a sociedade anônima may issue."),
      ),
      flag(
        "infrastructure",
        L("Projeto de infraestrutura enquadrado", "Qualifying infrastructure project"),
        (issuer) => issuer.infrastructureProject,
        L(
          "O benefício exige projeto de infraestrutura enquadrado por portaria do ministério do setor. Sem o enquadramento é uma debênture comum, sem a vantagem de taxa.",
          "The benefit requires an infrastructure project qualified by the sector ministry. Without that it is an ordinary debenture, without the rate advantage.",
        ),
      ),
    ],
    reaches: [
      L("Pessoas físicas, que é onde está a vantagem", "Individuals, which is where the advantage sits"),
      L("Fundos de infraestrutura e crédito privado", "Infrastructure and private credit funds"),
    ],
    parties: [
      L("Agente fiduciário e escriturador", "Trustee and registrar"),
      L("Assessor para o enquadramento do projeto", "Adviser for the project qualification"),
      L("Coordenador da distribuição", "Distribution coordinator"),
    ],
    pros: [
      L("Custo menor que o da debênture comum, porque a isenção do investidor volta em taxa.", "Cheaper than an ordinary debenture, because the investor's exemption comes back as rate."),
      L("Prazos longos, compatíveis com a maturação de um projeto.", "Long tenors, matched to a project's maturation."),
    ],
    cons: [
      L("O enquadramento é um processo à parte, com prazo próprio, e pode não sair.", "Qualification is a separate process with its own timeline, and it may not come through."),
      L("O uso dos recursos fica vinculado ao projeto e tem de ser comprovado ao longo da operação.", "Use of proceeds is tied to the project and has to be evidenced over the life of the debt."),
      L("Montagem mais longa que a de uma debênture comum.", "Longer to assemble than an ordinary debenture."),
    ],
    economicFloor: {amount: "30000000", note: L("Camada adicional de custo sobre a debênture comum.", "An extra cost layer over the ordinary debenture.")},
    weeksToFunding: {min: 12, max: 28},
  },
  {
    id: "nota_comercial",
    labels: L("Nota comercial", "Commercial note"),
    issuerRole: "issues",
    what: L(
      "Título de dívida mais simples que a debênture, que desde 2021 pode ser emitido também por sociedade limitada e por cooperativa.",
      "A debt security simpler than a debenture which, since 2021, may also be issued by a limitada or a cooperative.",
    ),
    legalBasis: "Lei 14.195/2021, arts. 45 a 51; emissão obrigatoriamente escritural por escriturador autorizado pela CVM",
    eligibility: [
      requiresLegalForm(
        ["sa_aberta", "sa_fechada", "ltda", "cooperativa"],
        L(
          "A Lei 14.195/2021 abriu a nota comercial para S.A., limitada e cooperativa. Outras formas societárias ficam de fora.",
          "Lei 14.195/2021 opened the commercial note to S.A., limitada and cooperative. Other corporate forms are excluded.",
        ),
      ),
      atLeast(
        "5000000",
        L(
          "Abaixo de R$ 5 milhões o custo do escriturador e do registro raramente compensa contra uma CCB.",
          "Below R$ 5 million the registrar and registration costs rarely beat a CCB.",
        ),
      ),
    ],
    reaches: [
      L("Fundos de crédito privado", "Private credit funds"),
      L("Investidores qualificados", "Qualified investors"),
      L("FIDCs, que podem comprar o título", "FIDCs, which may buy the security"),
    ],
    parties: [
      L("Escriturador autorizado pela CVM, obrigatório", "A CVM-authorised registrar, mandatory"),
      L("Assessor legal", "Legal counsel"),
      L("Agente fiduciário quando houver garantia ou pluralidade de titulares", "Trustee when there is security or multiple holders"),
    ],
    pros: [
      L("É o caminho de mercado de capitais para quem é Ltda. e não quer virar S.A.", "It is the capital markets route for a limitada that does not want to become an S.A."),
      L("Documentação bem mais curta que a de uma debênture, e prazo de montagem menor.", "Far shorter documentation than a debenture, and quicker to assemble."),
      L("Em oferta privada pode ter cláusula de conversão em participação, o que abre estruturas híbridas para quem não é S.A.", "In a private offering it may carry conversion into equity, which opens hybrid structures for non-S.A. issuers."),
    ],
    cons: [
      L("Só existe em forma escritural, por escriturador autorizado: não há versão em papel nem atalho.", "It exists only in scriptless form through an authorised registrar: there is no paper version and no shortcut."),
      L("Alcança menos investidores que a debênture, o que costuma significar prazo mais curto.", "Reaches fewer investors than a debenture, which usually means a shorter tenor."),
      L("Mercado secundário raso: o comprador precifica a iliquidez.", "Thin secondary market: the buyer prices the illiquidity in."),
    ],
    economicFloor: {amount: "5000000", note: L("Abaixo disso, a CCB costuma ser mais eficiente.", "Below this, a CCB is usually more efficient.")},
    weeksToFunding: {min: 4, max: 10},
  },
  {
    id: "cpr",
    labels: L("CPR, Cédula de Produto Rural", "CPR, rural product note"),
    issuerRole: "issues",
    what: L(
      "Título emitido por produtor rural ou cooperativa, com promessa de entregar produto ou o equivalente em dinheiro, usado para financiar a safra ou o investimento no campo.",
      "A note issued by a rural producer or cooperative promising delivery of produce or its cash equivalent, used to fund the crop or on-farm investment.",
    ),
    legalBasis: "Lei 8.929/1994, com as alterações da Lei 13.986/2020",
    eligibility: [
      flag(
        "rural",
        L("Produtor rural ou cooperativa", "Rural producer or cooperative"),
        (issuer) => issuer.ruralProducer,
        L("A CPR é emitida por produtor rural, suas associações e cooperativas. Uma indústria que compra do campo não emite CPR.", "A CPR is issued by rural producers, their associations and cooperatives. An industrial buyer of farm output does not issue one."),
      ),
    ],
    reaches: [
      L("Tradings e compradores da cadeia", "Traders and buyers in the chain"),
      L("Bancos e fundos do agronegócio", "Agribusiness banks and funds"),
      L("Securitizadoras, como lastro de CRA", "Securitisation companies, as CRA backing"),
    ],
    parties: [
      L("Registro em entidade registradora autorizada", "Registration with an authorised registrar"),
      L("Garantia real quando houver, com registro próprio", "In rem security when present, with its own registration"),
    ],
    pros: [
      L("Casada com o ciclo da safra, que é o fluxo que paga.", "Matched to the crop cycle, which is the cash flow that repays."),
      L("Serve de lastro para CRA, o que abre o mercado de capitais indiretamente.", "Serves as CRA backing, which opens the capital markets indirectly."),
    ],
    cons: [
      L("Exposição a preço e a clima entra no risco de crédito, e o comprador precifica isso.", "Price and weather exposure enter the credit risk, and the buyer prices it."),
      L("Fora do agronegócio não se aplica.", "Outside agribusiness it does not apply."),
    ],
    weeksToFunding: {min: 2, max: 8},
  },

  // ---- somebody else issues against credit the company originated -----------------------------
  {
    id: "cri",
    labels: L("CRI, Certificado de Recebíveis Imobiliários", "CRI, real estate receivables certificate"),
    issuerRole: "originates",
    what: L(
      "A companhia origina um crédito com lastro imobiliário e uma securitizadora emite o certificado que o mercado compra. A empresa não emite o CRI: ela é a devedora do crédito que o lastreia.",
      "The company originates a credit backed by real estate and a securitisation company issues the certificate the market buys. The company does not issue the CRI: it owes the credit behind it.",
    ),
    legalBasis: "Lei 14.430/2022, marco legal da securitização; emissão exclusiva de companhia securitizadora, com regime fiduciário e patrimônio separado (art. 26)",
    eligibility: [
      flag(
        "real_estate",
        L("Crédito com lastro imobiliário", "Credit with real estate backing"),
        (issuer) => issuer.realEstateCredit,
        L(
          "O CRI exige que o crédito se enquadre como imobiliário: aluguel, compra e venda de imóvel, construção, built to suit. Um crédito corporativo comum não vira CRI só porque a empresa tem imóveis.",
          "A CRI requires the credit to qualify as real estate: rent, property sale, construction, built to suit. An ordinary corporate credit does not become a CRI merely because the company owns property.",
        ),
      ),
      atLeast("15000000", L("Abaixo disso a estrutura de securitização raramente se paga.", "Below this the securitisation structure rarely pays for itself.")),
    ],
    reaches: [
      L("Pessoas físicas, com isenção de imposto de renda", "Individuals, income-tax exempt"),
      L("Fundos imobiliários e de crédito", "Real estate and credit funds"),
    ],
    parties: [
      L("Companhia securitizadora, que é quem emite", "The securitisation company, which is the issuer"),
      L("Agente fiduciário do patrimônio separado", "Trustee of the segregated estate"),
      L("Assessor legal e, havendo distribuição, coordenador", "Legal counsel and, if distributed, a coordinator"),
    ],
    pros: [
      L("A isenção do investidor pessoa física volta para a companhia em taxa menor.", "The individual investor's exemption comes back to the company as a lower rate."),
      L("O patrimônio separado isola o investidor do risco da securitizadora, o que melhora a percepção de risco.", "The segregated estate isolates the investor from the securitisation company's risk, which improves risk perception."),
      L("Prazos longos, compatíveis com ativo imobiliário.", "Long tenors, matched to a real estate asset."),
    ],
    cons: [
      L("A companhia não controla a emissão: a contraparte é a securitizadora, e ela tem critérios próprios.", "The company does not control the issuance: its counterparty is the securitisation company, with its own criteria."),
      L("O enquadramento imobiliário é jurídico e pode não sair, mesmo com imóvel no balanço.", "The real estate qualification is a legal test and may fail even with property on the balance sheet."),
      L("Mais partes envolvidas significa mais custo fixo e mais semanas.", "More parties means more fixed cost and more weeks."),
    ],
    economicFloor: {amount: "15000000", note: L("Custo da securitizadora e do agente fiduciário.", "The securitisation company and trustee costs.")},
    weeksToFunding: {min: 10, max: 24},
  },
  {
    id: "cra",
    labels: L("CRA, Certificado de Recebíveis do Agronegócio", "CRA, agribusiness receivables certificate"),
    issuerRole: "originates",
    what: L(
      "O mesmo desenho do CRI, com lastro no agronegócio. Emitido por securitizadora contra crédito originado por quem atua na cadeia agro.",
      "The same design as a CRI, backed by agribusiness. Issued by a securitisation company against credit originated by someone in the agro chain.",
    ),
    legalBasis: "Lei 14.430/2022; emissão exclusiva de companhia securitizadora",
    eligibility: [
      flag(
        "agribusiness",
        L("Crédito com lastro no agronegócio", "Credit with agribusiness backing"),
        (issuer) => issuer.agribusinessCredit,
        L(
          "O CRA exige que o crédito se enquadre no agronegócio. A cadeia é ampla e inclui insumos, máquinas e processamento, mas o enquadramento é jurídico e precisa ser demonstrado.",
          "A CRA requires the credit to qualify as agribusiness. The chain is broad and includes inputs, machinery and processing, but the qualification is a legal test and has to be shown.",
        ),
      ),
      atLeast(
        "15000000",
        L(
          "Abaixo de R$ 15 milhões a estrutura de securitização, com securitizadora, agente fiduciário e assessores, custa mais do que a vantagem de taxa devolve.",
          "Below R$ 15 million the securitisation structure, with its securitisation company, trustee and advisers, costs more than the rate advantage gives back.",
        ),
      ),
    ],
    reaches: [
      L("Pessoas físicas, com isenção", "Individuals, tax exempt"),
      L("Fundos do agronegócio e de crédito privado", "Agribusiness and private credit funds"),
    ],
    parties: [
      L("Companhia securitizadora", "Securitisation company"),
      L("Agente fiduciário", "Trustee"),
      L("Assessor legal para o enquadramento", "Legal counsel for the qualification"),
    ],
    pros: [
      L("Custo menor pela isenção do investidor pessoa física.", "Lower cost through the individual investor's exemption."),
      L("Mercado comprador profundo no Brasil, com demanda constante.", "A deep buyer base in Brazil, with steady demand."),
    ],
    cons: [
      L("Sem enquadramento agro não existe, e o enquadramento é o primeiro obstáculo.", "Without the agro qualification it does not exist, and that qualification is the first hurdle."),
      L("A contraparte é a securitizadora, não o investidor final.", "The counterparty is the securitisation company, not the final investor."),
    ],
    economicFloor: {
      amount: "15000000",
      note: L("Onde o custo da securitizadora e do agente fiduciário deixa de dominar.", "Where the securitisation company and trustee costs stop dominating."),
    },
    weeksToFunding: {min: 10, max: 24},
  },
  {
    id: "cdca",
    labels: L("CDCA, Certificado de Direitos Creditórios do Agronegócio", "CDCA, agribusiness credit rights certificate"),
    issuerRole: "originates",
    what: L(
      "Título emitido por quem atua no agronegócio, lastreado em direitos creditórios do setor, como CPRs que a empresa tem a receber.",
      "A security issued by an agribusiness participant, backed by agribusiness credit rights such as CPRs the company is owed.",
    ),
    legalBasis: "Lei 11.076/2004",
    eligibility: [
      flag(
        "agribusiness",
        L("Atuação e direitos creditórios do agronegócio", "Agribusiness activity and credit rights"),
        (issuer) => issuer.agribusinessCredit,
        L("O CDCA é emitido por cooperativas e por pessoas jurídicas que atuam na cadeia agro, com lastro em direitos creditórios do setor.", "A CDCA is issued by cooperatives and companies operating in the agro chain, backed by sector credit rights."),
      ),
    ],
    reaches: [L("Bancos e fundos do agronegócio", "Agribusiness banks and funds"), L("Investidores qualificados", "Qualified investors")],
    parties: [L("Registro em entidade registradora", "Registration with a registrar"), L("Custodiante do lastro", "Custodian of the backing")],
    pros: [
      L("Transforma recebível do agro em captação sem passar por securitizadora.", "Turns agro receivables into funding without going through a securitisation company."),
      L("Mais rápido e mais barato de montar que um CRA.", "Faster and cheaper to assemble than a CRA."),
    ],
    cons: [
      L("Depende de haver carteira de direitos creditórios do agro já formada.", "Depends on an existing agro credit rights book."),
      L("Alcança menos investidores que o CRA.", "Reaches fewer investors than a CRA."),
    ],
    weeksToFunding: {min: 3, max: 10},
  },

  // ---- the company assigns a receivable --------------------------------------------------------
  {
    id: "fidc",
    labels: L("Cessão para FIDC", "Assignment to an FIDC"),
    issuerRole: "assigns",
    what: L(
      "A companhia vende sua carteira de recebíveis a um fundo de direitos creditórios. Não é empréstimo: é venda, e o risco passa a ser principalmente de quem deve o recebível.",
      "The company sells its receivables book to a credit rights fund. It is not a loan but a sale, and the risk shifts mainly to whoever owes the receivable.",
    ),
    legalBasis: "Resolução CVM 175, Anexo Normativo II (FIDC)",
    eligibility: [
      flag(
        "receivables",
        L("Carteira de recebíveis cedível", "An assignable receivables book"),
        (issuer) => issuer.hasAssignableReceivables,
        L(
          "Sem carteira de recebíveis não há o que ceder. E recebível já cedido, vinculado a outra operação ou concentrado em poucos sacados restringe muito o que o fundo aceita.",
          "With no receivables book there is nothing to assign. And receivables already assigned, pledged elsewhere or concentrated in a few payers sharply limit what a fund accepts.",
        ),
      ),
    ],
    reaches: [L("FIDCs multicedente e exclusivos", "Multi-assignor and dedicated FIDCs"), L("Securitizadoras de crédito", "Credit securitisation companies")],
    parties: [
      L("Administrador e gestor do fundo", "Fund administrator and manager"),
      L("Custodiante e registradora dos recebíveis", "Custodian and receivables registrar"),
      L("Agente de cobrança, quando não for a própria companhia", "Collection agent, when not the company itself"),
    ],
    pros: [
      L("O risco olhado é o do sacado, não só o da companhia, o que ajuda quem tem cliente melhor que ela própria.", "The risk assessed is the payer's, not only the company's, which helps a company whose customers are stronger than it is."),
      L("Recorrente por natureza: uma vez montada, a cessão se repete a cada safra de recebíveis.", "Recurring by nature: once set up, assignment repeats with each vintage of receivables."),
      L("Não aumenta dívida no balanço quando a cessão é sem coobrigação.", "Does not increase balance sheet debt when the assignment is without recourse."),
    ],
    cons: [
      L("Consome a garantia: recebível cedido não serve mais de lastro para o próximo financiador, e essa conta costuma aparecer tarde.", "It consumes the collateral: an assigned receivable no longer backs the next lender, and that bill usually arrives late."),
      L("Diluição, glosa e devolução voltam para a companhia, então o custo efetivo não é só a taxa.", "Dilution, disputes and returns come back to the company, so the effective cost is not only the rate."),
      L("Concentração de sacados é o que mais reprova carteira, e ela raramente se resolve rápido.", "Payer concentration is what most often fails a book, and it rarely resolves quickly."),
    ],
    weeksToFunding: {min: 3, max: 10},
  },
  {
    id: "receivables_purchase",
    labels: L("Antecipação de recebíveis", "Receivables discounting"),
    issuerRole: "assigns",
    what: L(
      "Desconto de duplicatas, contratos ou recebíveis de cartão junto a banco, factoring ou fintech. O dinheiro entra rápido e o custo é o desconto aplicado.",
      "Discounting invoices, contracts or card receivables with a bank, factoring house or fintech. Cash arrives fast and the cost is the discount applied.",
    ),
    legalBasis: "Contratos de cessão de crédito; duplicata escritural sob a Lei 13.775/2018",
    eligibility: [
      flag(
        "receivables",
        L("Recebíveis a vencer", "Receivables not yet due"),
        (issuer) => issuer.hasAssignableReceivables,
        L(
          "Sem recebível a vencer não há o que antecipar. E recebível já cedido a outra operação não conta duas vezes: o mesmo título não garante dois credores.",
          "With no receivables outstanding there is nothing to discount. And a receivable already assigned elsewhere does not count twice: the same title does not secure two lenders.",
        ),
      ),
    ],
    reaches: [L("Bancos", "Banks"), L("Factorings", "Factoring houses"), L("Fintechs de crédito", "Credit fintechs")],
    parties: [L("Registradora de recebíveis, conforme o tipo", "Receivables registrar, depending on the type")],
    pros: [
      L("Dias, não semanas. É o instrumento mais rápido que existe.", "Days, not weeks. It is the fastest instrument there is."),
      L("Não exige estrutura, assessor nem escritura.", "Requires no structure, adviser or indenture."),
    ],
    cons: [
      L("É o dinheiro mais caro do mercado quando usado de forma recorrente.", "It is the most expensive money in the market when used repeatedly."),
      L("Resolve caixa, não resolve estrutura: quem antecipa todo mês tem um problema que a antecipação esconde.", "It solves cash, not structure: a company discounting every month has a problem that discounting hides."),
      L("Consome o mesmo recebível que serviria de garantia numa operação melhor.", "It consumes the same receivable that would have secured a better transaction."),
    ],
    weeksToFunding: {min: 0, max: 2},
  },

  // ---- bilateral -------------------------------------------------------------------------------
  {
    id: "ccb",
    labels: L("CCB, Cédula de Crédito Bancário", "CCB, bank credit note"),
    issuerRole: "borrows",
    what: L(
      "Título de crédito emitido pela companhia em favor de uma instituição financeira. É o caminho bilateral mais direto, e a CCB pode depois ser cedida a um FIDC ou a um fundo.",
      "A credit note issued by the company in favour of a financial institution. The most direct bilateral route, and the CCB can later be assigned to an FIDC or a fund.",
    ),
    legalBasis: "Lei 10.931/2004, arts. 26 a 45",
    eligibility: [],
    reaches: [
      L("Bancos e financeiras", "Banks and finance companies"),
      L("Fundos de crédito, por cessão da cédula", "Credit funds, through assignment of the note"),
      L("FIDCs", "FIDCs"),
    ],
    parties: [L("Instituição financeira credora", "The lending financial institution"), L("Registro conforme a garantia", "Registration according to the security")],
    pros: [
      L("Serve para qualquer forma societária, sem exigência de virar S.A.", "Works for any corporate form, with no requirement to become an S.A."),
      L("Documentação curta e prazo de montagem em semanas.", "Short documentation and weeks to assemble."),
      L("Título executivo extrajudicial, o que reduz o risco percebido e ajuda no custo.", "An enforceable instrument, which lowers perceived risk and helps the cost."),
      L("Pode ser cedida depois, então uma CCB bem feita alcança fundos indiretamente.", "It can be assigned later, so a well-built CCB reaches funds indirectly."),
    ],
    cons: [
      L("Bilateral: negocia com um credor por vez, sem a concorrência que baixa preço.", "Bilateral: one lender at a time, without the competition that lowers price."),
      L("Prazos geralmente mais curtos que os do mercado de capitais.", "Tenors generally shorter than in the capital markets."),
      L("Costuma exigir garantia real e aval dos sócios.", "Usually requires in rem security and shareholder guarantees."),
    ],
    weeksToFunding: {min: 2, max: 8},
  },
  {
    id: "direct_loan",
    labels: L("Empréstimo bancário direto", "Direct bank loan"),
    issuerRole: "borrows",
    what: L(
      "Contrato de mútuo ou capital de giro com um banco, sem título de crédito autônomo. É a linha tradicional que a maioria das empresas já conhece.",
      "A loan or working capital contract with a bank, without a standalone credit instrument. The traditional line most companies already know.",
    ),
    legalBasis: "Contrato bancário comum",
    eligibility: [],
    reaches: [L("Bancos comerciais", "Commercial banks")],
    parties: [L("Banco", "The bank")],
    pros: [
      L("Relacionamento já existente costuma acelerar tudo.", "An existing relationship usually speeds everything up."),
      L("Sem custo de estruturação relevante.", "No meaningful structuring cost."),
    ],
    cons: [
      L("É exatamente a linha que já não está evoluindo para quem procura crédito privado.", "It is precisely the line that has stopped progressing for a company seeking private credit."),
      L("Limite e prazo presos à política do banco, não ao mérito da operação.", "Limit and tenor tied to the bank's policy rather than the transaction's merit."),
    ],
    weeksToFunding: {min: 1, max: 6},
  },
  {
    id: "leasing",
    labels: L("Leasing, arrendamento mercantil", "Leasing"),
    issuerRole: "borrows",
    what: L(
      "A arrendadora compra o bem e a companhia paga contraprestações pelo uso, com opção de compra ao final. A garantia é o próprio bem, que continua no nome de quem financia.",
      "The lessor buys the asset and the company pays for its use, with a purchase option at the end. The security is the asset itself, which stays in the financier's name.",
    ),
    legalBasis: "Lei 6.099/1974 e regulamentação do Banco Central",
    eligibility: [
      flag(
        "equipment",
        L("Aquisição de bem", "Asset purchase"),
        (issuer) => issuer.financingEquipment,
        L("O leasing financia um bem identificável. Não serve para capital de giro nem para refinanciar dívida.", "Leasing funds an identifiable asset. It does not serve working capital or refinancing."),
      ),
    ],
    reaches: [L("Arrendadoras e bancos", "Leasing companies and banks")],
    parties: [L("Arrendadora", "Lessor"), L("Fornecedor do bem", "Asset supplier")],
    pros: [
      L("O bem é a garantia, então dispensa colateral adicional em boa parte dos casos.", "The asset is the security, so additional collateral is often unnecessary."),
      L("Aprovação mais simples do que a de uma operação estruturada.", "Simpler approval than a structured transaction."),
    ],
    cons: [
      L("A companhia não é dona do bem até exercer a opção, o que trava usá-lo em outra garantia.", "The company does not own the asset until it exercises the option, which blocks using it as security elsewhere."),
      L("Só existe para o bem: não resolve a necessidade de caixa em volta dele.", "It exists only for the asset: it does not solve the cash need around it."),
    ],
    weeksToFunding: {min: 2, max: 8},
  },
  {
    id: "finame",
    labels: L("FINAME, repasse BNDES", "FINAME, BNDES on-lending"),
    issuerRole: "borrows",
    what: L(
      "Financiamento de máquinas e equipamentos de fabricação nacional com recursos do BNDES, contratado através de um banco repassador.",
      "Financing of domestically manufactured machinery and equipment with BNDES funds, contracted through an on-lending bank.",
    ),
    legalBasis: "Programas do BNDES; contratação por instituição financeira credenciada",
    eligibility: [
      flag(
        "equipment",
        L("Máquina ou equipamento elegível", "Eligible machinery or equipment"),
        (issuer) => issuer.financingEquipment,
        L("O FINAME financia bens credenciados no BNDES. Bem importado ou sem credenciamento fica fora.", "FINAME funds equipment accredited with BNDES. Imported or unaccredited equipment is excluded."),
      ),
    ],
    reaches: [L("Bancos repassadores credenciados", "Accredited on-lending banks")],
    parties: [L("Banco repassador", "On-lending bank"), L("Fabricante credenciado", "Accredited manufacturer")],
    pros: [
      L("Custo bem abaixo do mercado, com prazo longo e carência.", "Cost well below market, with long tenor and grace."),
      L("Não consome o apetite do banco pela operação principal, porque o funding é do BNDES.", "It does not consume the bank's appetite for the main transaction, because the funding is BNDES's."),
    ],
    cons: [
      L("Só para o bem credenciado, e o processo é burocrático e lento.", "Only for accredited equipment, and the process is bureaucratic and slow."),
      L("O banco repassador ainda analisa o crédito e pode recusar mesmo com o bem elegível.", "The on-lending bank still underwrites and may decline even with eligible equipment."),
    ],
    weeksToFunding: {min: 6, max: 20},
  },
  {
    id: "project_finance",
    labels: L("Financiamento de projeto", "Project finance"),
    issuerRole: "borrows",
    what: L(
      "Estrutura em que a dívida é paga pelo próprio projeto, dentro de uma sociedade criada para ele, com recurso limitado aos acionistas.",
      "A structure where the debt is repaid by the project itself, inside a company created for it, with limited recourse to the shareholders.",
    ),
    legalBasis: "Estrutura contratual; forma jurídica conforme a sociedade de propósito específico",
    eligibility: [
      atLeast(
        "50000000",
        L("Abaixo de R$ 50 milhões a estrutura contratual custa mais do que entrega.", "Below R$ 50 million the contractual structure costs more than it delivers."),
      ),
    ],
    reaches: [L("Bancos de fomento e multilaterais", "Development and multilateral banks"), L("Fundos de infraestrutura", "Infrastructure funds")],
    parties: [
      L("Sociedade de propósito específico", "Special purpose company"),
      L("Assessores técnico, legal e de seguros", "Technical, legal and insurance advisers"),
      L("Agente de garantias e conta vinculada", "Security agent and escrow account"),
    ],
    pros: [
      L("Isola o projeto do balanço da controladora.", "Isolates the project from the parent's balance sheet."),
      L("Prazos longos, casados com a vida útil do ativo.", "Long tenors, matched to the asset's useful life."),
    ],
    cons: [
      L("Meses de montagem e uma pilha de contratos: EPC, O&M, seguros, offtake.", "Months to assemble and a stack of contracts: EPC, O&M, insurance, offtake."),
      L("Custo fixo alto, que só se dilui em operação grande.", "High fixed cost, which only dilutes in a large transaction."),
    ],
    economicFloor: {amount: "50000000", note: L("Piso onde a estrutura contratual se paga.", "The floor where the contractual structure pays for itself.")},
    weeksToFunding: {min: 20, max: 52},
  },
  {
    id: "equity_kicker_debt",
    labels: L("Mezanino, dívida com participação", "Mezzanine, debt with an equity kicker"),
    issuerRole: "borrows",
    what: L(
      "Dívida subordinada com remuneração parcialmente ligada ao desempenho ou com conversão em participação, para quando a dívida sênior não cobre a necessidade.",
      "Subordinated debt with return partly linked to performance or convertible into equity, for when senior debt does not cover the need.",
    ),
    legalBasis: "Contratual; conversão em participação depende da forma societária",
    eligibility: [],
    reaches: [L("Fundos de special situations e mezanino", "Special situations and mezzanine funds"), L("Family offices", "Family offices")],
    parties: [L("Assessor legal para o acordo de acionistas ou a conversão", "Legal counsel for the shareholders' agreement or the conversion")],
    pros: [
      L("Entra onde a dívida sênior parou, sem diluir imediatamente.", "It goes where senior debt stopped, without immediate dilution."),
      L("Flexível na amortização, o que ajuda projeto com maturação longa.", "Flexible on amortisation, which helps a project with long maturation."),
    ],
    cons: [
      L("O mais caro dos instrumentos de dívida, e com razão: é o primeiro a perder.", "The most expensive debt instrument, and rightly so: it is first to lose."),
      L("Costuma vir com direitos de governança que mudam a vida do controlador.", "It usually comes with governance rights that change the controlling shareholder's life."),
      L("Conversão em participação exige forma societária que a comporte.", "Conversion into equity requires a corporate form that allows it."),
    ],
    weeksToFunding: {min: 8, max: 20},
  },
  // ---- backed by a round rather than by EBITDA --------------------------------------------------
  //
  // Everything above is underwritten on cash generation. These three are not, and that is the
  // whole point of separating them: a company burning cash on purpose to grow fails every DSCR
  // and leverage test this system applies, and a desk that stops there tells a good startup it is
  // uninvestable. The lender here is looking at the last round, the recurring revenue and the
  // runway, and asking a different question: does this money buy enough months to reach the next
  // round on better terms.
  {
    id: "venture_debt",
    labels: L("Venture debt", "Venture debt"),
    issuerRole: "borrows",
    what: L(
      "Dívida para startup já investida por fundo de venture capital, dimensionada contra a última rodada e quase sempre acompanhada de warrant, que dá ao credor o direito de comprar participação no futuro.",
      "Debt for a startup already backed by a venture fund, sized against the last round and almost always carrying a warrant giving the lender the right to buy equity later.",
    ),
    legalBasis: "Estruturado como debênture (se S.A.), nota comercial ou CCB, somado a warrant ou opção contratual",
    eligibility: [
      flag(
        "venture_backed",
        L("Rodada institucional fechada", "A closed institutional round"),
        (issuer) => issuer.venturebacked,
        L(
          "Venture debt praticamente não existe sem rodada institucional recente: quem empresta está contando com o próximo aporte como fonte de pagamento, e com o fundo de equity como sinal de qualidade.",
          "Venture debt barely exists without a recent institutional round: the lender is counting on the next raise as a source of repayment, and on the equity fund as a quality signal.",
        ),
      ),
      {
        id: "runway",
        labels: L("Caixa de sobrevida", "Runway"),
        test: (issuer) => issuer.runwayMonths === undefined || issuer.runwayMonths >= 6,
        whenUnmet: L(
          "Com menos de seis meses de caixa o credor estaria financiando a queda, não o crescimento. Venture debt se levanta quando ainda há caixa, não quando ele acabou.",
          "With under six months of cash the lender would be funding the fall rather than the growth. Venture debt is raised while cash remains, not once it is gone.",
        ),
      },
      {
        id: "round_proportion",
        labels: L("Proporção da última rodada", "Proportion of the last round"),
        test: (issuer) => {
          if (!issuer.amount || !issuer.lastRoundAmount) return true;
          // The market convention is roughly a third of the last round. Beyond that the lender is
          // taking equity risk at debt pricing, and stops.
          return new Decimal(issuer.amount).lte(new Decimal(issuer.lastRoundAmount).times("0.35"));
        },
        whenUnmet: L(
          "O mercado dimensiona venture debt em torno de 30% da última rodada. Acima disso o credor estaria tomando risco de equity com preço de dívida, e é onde a conversa costuma parar.",
          "The market sizes venture debt at roughly 30% of the last round. Above that the lender would be taking equity risk at debt pricing, and that is where the conversation usually stops.",
        ),
      },
    ],
    reaches: [
      L("Gestoras especializadas em venture debt", "Dedicated venture debt managers"),
      L("Braços de crédito de bancos de investimento", "Investment banks' credit arms"),
      L("Fundos de crédito com mandato para tecnologia", "Credit funds with a technology mandate"),
    ],
    parties: [
      L("Assessor legal para o warrant e o acordo de acionistas", "Legal counsel for the warrant and the shareholders' agreement"),
      L("Anuência do fundo de equity, na prática", "The equity fund's blessing, in practice"),
    ],
    pros: [
      L("Estende o caixa sem diluir agora, o que é o argumento inteiro: chega-se à próxima rodada com métrica melhor.", "Extends cash without diluting now, which is the entire argument: you reach the next round with better metrics."),
      L("Decisão rápida comparada a uma rodada de equity.", "A fast decision compared with an equity round."),
      L("O warrant costuma custar bem menos em diluição do que levantar o mesmo valor em equity.", "The warrant usually costs far less in dilution than raising the same amount in equity."),
    ],
    cons: [
      L("Dívida com vencimento em empresa que queima caixa: se a próxima rodada atrasar, a parcela não espera.", "Debt with a maturity in a company that burns cash: if the next round slips, the instalment does not wait."),
      L("Covenants costumam incluir gatilhos de caixa mínimo, que apertam justo no pior momento.", "Covenants usually include minimum cash triggers, which bite at exactly the worst moment."),
      L("Taxa alta e warrant somados fazem o custo efetivo ser bem maior do que a taxa nominal sugere.", "A high rate plus the warrant make the effective cost far higher than the headline rate suggests."),
      L("Credor sênior na frente do equity muda a conversa em qualquer negociação futura.", "A senior lender ahead of the equity changes the conversation in any future negotiation."),
    ],
    weeksToFunding: {min: 4, max: 12},
  },
  {
    id: "mutuo_conversivel",
    labels: L("Mútuo conversível", "Convertible loan"),
    issuerRole: "borrows",
    what: L(
      "Empréstimo que pode virar participação numa rodada futura, em condições combinadas hoje. É o instrumento mais comum de estágio inicial no Brasil, e formalmente é dívida.",
      "A loan that can convert into equity at a future round, on terms agreed today. The most common early-stage instrument in Brazil, and formally it is debt.",
    ),
    legalBasis: "Contrato de mútuo com cláusula de conversão; para Ltda., a nota comercial da Lei 14.195/2021 admite conversão em oferta privada",
    eligibility: [],
    reaches: [
      L("Fundos de venture capital", "Venture capital funds"),
      L("Investidores anjo e family offices", "Angels and family offices"),
      L("Aceleradoras", "Accelerators"),
    ],
    parties: [L("Assessor legal para a conversão e o cap table", "Legal counsel for the conversion and the cap table")],
    pros: [
      L("Rápido e barato de fechar, sem discutir valuation agora.", "Fast and cheap to close, with no valuation discussion today."),
      L("Se a empresa é Ltda., a nota comercial conversível dá forma de valor mobiliário a isso sem virar S.A.", "For a limitada, the convertible commercial note gives this the form of a security without becoming an S.A."),
    ],
    cons: [
      L("Empilhar mútuos sem rodada deixa um cap table que assusta o investidor seguinte.", "Stacking convertibles with no round leaves a cap table that frightens the next investor."),
      L("Desconto e teto de valuation combinados hoje podem sair muito caros depois.", "The discount and valuation cap agreed today can prove very expensive later."),
      L("Se não converter, vira dívida vencida numa empresa sem caixa.", "If it does not convert, it becomes matured debt in a company with no cash."),
    ],
    weeksToFunding: {min: 1, max: 6},
  },
  {
    id: "revenue_based_financing",
    labels: L("Financiamento por receita", "Revenue-based financing"),
    issuerRole: "borrows",
    what: L(
      "Capital devolvido como percentual da receita mensal até atingir um múltiplo combinado, em vez de parcela fixa. Feito para empresa com receita recorrente e previsível.",
      "Capital repaid as a percentage of monthly revenue until an agreed multiple is reached, instead of a fixed instalment. Built for recurring, predictable revenue.",
    ),
    legalBasis: "Contratual, frequentemente via CCB com amortização variável ou cessão de recebíveis de assinatura",
    eligibility: [
      flag(
        "recurring",
        L("Receita recorrente e previsível", "Recurring, predictable revenue"),
        (issuer) => issuer.recurringRevenue,
        L(
          "O modelo inteiro depende de receita recorrente: sem assinatura ou contrato de prazo, não há o que amortizar como percentual.",
          "The whole model rests on recurring revenue: with no subscription or term contract there is nothing to amortise as a percentage.",
        ),
      ),
    ],
    reaches: [
      L("Gestoras de revenue-based financing", "Revenue-based financing managers"),
      L("FIDCs com lastro em recebíveis de assinatura", "FIDCs backed by subscription receivables"),
    ],
    parties: [L("Integração com o sistema de cobrança, para medir a receita", "Integration with the billing system, to measure revenue")],
    pros: [
      L("A parcela cai quando a receita cai, o que é a única forma de dívida que não quebra o mês ruim.", "The instalment falls when revenue falls, which is the only form of debt that does not break a bad month."),
      L("Não dilui participação e não exige warrant, então o custo acaba onde o contrato diz que acaba.", "No dilution and no warrant, so the cost ends where the contract says it ends."),
      L("Decisão rápida, baseada em dado do próprio faturamento.", "A fast decision, based on the company's own billing data."),
    ],
    cons: [
      L("O múltiplo combinado costuma equivaler a uma taxa alta quando anualizado.", "The agreed multiple usually equates to a high rate when annualised."),
      L("Consome um percentual do caixa todo mês, justamente o caixa que financiaria o crescimento.", "It consumes a share of cash every month, precisely the cash that would fund growth."),
      L("Volumes menores que os de venture debt.", "Smaller amounts than venture debt."),
    ],
    weeksToFunding: {min: 1, max: 6},
  },
];

const byId = new Map<Instrument, InstrumentProfile>(catalogue.map((profile) => [profile.id, profile]));

export function instrument(id: Instrument): InstrumentProfile {
  const profile = byId.get(id);
  if (!profile) throw new Error(`unknown instrument: ${id}`);
  return profile;
}
