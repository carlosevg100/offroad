import type {CapitalStructurePathsInput} from "@offroad/financial-core";
import type {AdoptionBasisEntry} from "@offroad/reconciliation";
import type {AdoptedCapitalPathsInput} from "./adopted-capital-structure-paths";
import {analysisTestBasis, analysisTestId as id} from "./adopted-analysis.test-support";
import {composeBoundCapitalPaths} from "./capital-structure-paths-composer";
import type {CapitalPathsPacketInput} from "./capital-structure-paths-packet";
import {encodeCapitalPaths, type CapitalPathsFacts} from "./capital-structure-paths-premises";

/** Aurora Alimentos on 14/ago/2026 (ficha C32, synthetic), as the independent oracle modelo_aurora_c32.py
 * states it: debt of June 2026, the company by drivers, the packaging line followed, deferred twelve months
 * or left out, the seven paths of the ficha and two companions (the bank route and the Bradesco extension
 * without the line). The annual base after 2028 is the one of ficha C04. BRL millions. Synthetic
 * calibration, never a production parameter. */
const q = (values: Record<number, string>, fill = "0") => Array.from({length: 10}, (_, k) => values[k] ?? fill);
const same = (v: string) => q({}, v);
const third = "0.33333333333333333333";
type Instrument = CapitalStructurePathsInput["instruments"][number];
const base = {role: "new" as const, replaces: null, openingPrincipal: "0", finalPaymentDate: null, interestEvery: "quarter" as const, couponTreatment: "cash_paid" as const,
  couponBase: "opening_principal" as const, prepayment: null, afterHorizon: {kind: "none" as const}};
const giro = (id: string, label: string, at: number, amount: string, spread: string, fee: string, iof: string, security: string, seasonal: boolean): Instrument => ({...base, id, label,
  lenderKind: "bank", rate: {kind: "index_plus_spread", spreads: same(spread)}, draws: q({[at]: amount}), principal: q(seasonal ? {} : {[at + 1]: amount}),
  charges: [{id: "comissao", periodEnd: auroraPeriodEnds[at]!, category: "origination_fee", amount: fee}, {id: "iof", periodEnd: auroraPeriodEnds[at]!, category: "tax", amount: iof}],
  security: {kind: "receivables", amount: security, countsAgainstBasket: true}, afterHorizon: seasonal ? {kind: "seasonal_release", settlementMonthsAfterDraw: 6, justification: "Linha da safra quitada até março com a recomposição do giro da safra, como nos anos anteriores"} : {kind: "none"}});
export const auroraPeriodEnds = ["2026-09-30", "2026-12-31", "2027-03-31", "2027-06-30", "2027-09-30", "2027-12-31", "2028-03-31", "2028-06-30", "2028-09-30", "2028-12-31"];
const existing = ["debenture-2021", "ccb-bradesco", "finame"];
const prepayBoth = [{instrumentId: "debenture-2021", periodEnd: "2027-03-31"}, {instrumentId: "ccb-bradesco", periodEnd: "2027-03-31"}];
const seasonal = (first: string) => [first, "giro-4t27", "giro-4t28"];
const waiver = [{id: "waiver", instrumentId: "debenture-2021", periodEnd: "2027-03-31", category: "other" as const, amount: "0.525"}];

export function auroraCapitalPathsKernel(): CapitalStructurePathsInput {
  return {
    currency: "BRL", openingDate: "2026-06-30", periodEnds: [...auroraPeriodEnds], openingAvailable: "35", minimumCash: "15",
    index: {name: "DI", annualByPeriod: q({0: "0.149", 1: "0.149", 2: "0.14", 3: "0.14", 4: "0.14", 5: "0.14"}, "0.1275"),
      afterHorizon: [2029, 2030, 2031, 2032, 2033].map((year) => ({year, annualRate: "0.12"}))},
    tax: {rate: "0.34", lossTreatment: "no_cash_benefit"},
    operating: {ebitda: ["13.5", "14", "14", "14", "14.3", "14.3", "14.7", "14.7", "14.7", "14.7"], depreciation: same("3"), leasePayments: same("0.75"),
      workingCapitalCashFlow: q({1: "-25.625", 2: "24.375", 5: "-25.625", 6: "24.375", 9: "-25.625"}, "-0.625"), maintenanceCapex: same("2")},
    availableForService: "operating_cash_before_project_investment",
    projectVariants: [
      {id: "seguir", label: "Linha de embalagem no cronograma informado", effects: {ebitda: q({3: "0.5", 4: "1.25", 5: "1.5", 6: "1.5", 7: "1.5", 8: "1.5", 9: "1.5"}),
        depreciation: q({3: "0.45", 4: "0.45", 5: "0.45", 6: "0.45", 7: "0.45", 8: "0.45", 9: "0.45"}), maintenanceCapex: q({4: "0.15", 5: "0.15", 6: "0.15", 7: "0.15", 8: "0.15", 9: "0.15"}),
        growthCapex: q({1: "10", 2: "4", 3: "4"}), startupWorkingCapitalCashFlow: q({3: "-3", 4: "-2.8"})}},
      {id: "adiar-12", label: "Linha de embalagem adiada doze meses", effects: {ebitda: q({7: "0.5", 8: "1.25", 9: "1.5"}), depreciation: q({7: "0.45", 8: "0.45", 9: "0.45"}),
        maintenanceCapex: q({8: "0.15", 9: "0.15"}), growthCapex: q({5: "10", 6: "4", 7: "4"}), startupWorkingCapitalCashFlow: q({7: "-3", 8: "-2.8"})}},
      {id: "sem-linha", label: "Sem a linha de embalagem até a revisão", effects: null}],
    stress: {id: "ebitda-menos-15", label: "EBITDA 15% menor, caso que um banco tende a usar", ebitdaFactor: "0.85", fromPeriodEnd: "2026-12-31"},
    covenant: {ebitdaExcludesLeases: true, history: [{id: "1s26", months: 6, ebitda: "27", leasePayments: "1.5"}],
      indenture: {limit: "3", comparator: "lte", measurementPeriodEnds: ["2026-12-31", "2027-12-31", "2028-12-31"], source: "Escritura de 2021 com o aditamento de 2023"},
      policy: {limit: "2.5", comparator: "lte", measurementPeriodEnds: ["2026-12-31", "2027-12-31", "2028-12-31"], definition: "indenture_definition", source: "Ata do conselho de março de 2026"}},
    basket: {holderId: "debenture-2021", limit: "15", basis: "aggregate", occupied: "12", source: "Negative pledge da escritura de 2021: exceção agregada de R$ 15 mi; cessão ao Bradesco de 2024"},
    instruments: [
      {...base, id: "debenture-2021", label: "Debênture 2021", role: "existing", lenderKind: "capital_markets", openingPrincipal: "60", rate: {kind: "index_plus_spread", spreads: same("0.024")},
        interestEvery: "semester", couponTreatment: "accrued_until_paid", draws: same("0"), principal: q({1: "15", 3: "15", 5: "15", 7: "15"}), charges: [],
        security: {kind: "none", amount: "0", countsAgainstBasket: false}, prepayment: {basis: "per_year_of_weighted_remaining_life", rate: "0.003"}},
      {...base, id: "ccb-bradesco", label: "CCB Bradesco", role: "existing", lenderKind: "bank", openingPrincipal: "40", finalPaymentDate: "2027-09-15",
        rate: {kind: "index_plus_spread", spreads: same("0.026")}, draws: same("0"), principal: q({4: "40"}), charges: [],
        security: {kind: "receivables", amount: "12", countsAgainstBasket: true}, prepayment: {basis: "flat", rate: "0.01"}},
      {...base, id: "finame", label: "Finame", role: "existing", lenderKind: "development_bank", openingPrincipal: "30", rate: {kind: "fixed", annualRates: same("0.097")},
        couponBase: "average_principal", draws: same("0"), principal: same("1.66666667"), charges: [], security: {kind: "financed_asset", amount: "0", countsAgainstBasket: false},
        afterHorizon: {kind: "scheduled", shares: [{year: 2029, share: "0.5"}, {year: 2030, share: "0.5"}], alternatives: []}},
      giro("giro-4t26-27", "Giro da safra de 2026, R$ 27 mi", 1, "27", "0.025", "0.081", "0.505548", "3", false),
      giro("giro-4t26-17", "Giro da safra de 2026, R$ 17 mi", 1, "17", "0.025", "0.051", "0.318308", "3", false),
      giro("giro-4t27", "Giro da safra de 2027", 5, "20", "0.02", "0.06", "0.37448", "15", false),
      giro("giro-4t28", "Giro da safra de 2028", 9, "20", "0.02", "0.06", "0.37448", "15", true),
      {...base, id: "ccb-tres-anos", label: "CCB de três anos, R$ 30 mi", lenderKind: "bank", rate: {kind: "index_plus_spread", spreads: same("0.021")},
        draws: q({1: "30"}), principal: q({3: "3", 4: "3", 5: "3", 6: "3", 7: "3", 8: "3", 9: "3"}),
        charges: [{id: "comissao", periodEnd: "2026-12-31", category: "origination_fee", amount: "0.24"}, {id: "iof", periodEnd: "2026-12-31", category: "tax", amount: "1.0119"}],
        security: {kind: "receivables", amount: "39", countsAgainstBasket: true}, afterHorizon: {kind: "scheduled", shares: [{year: 2029, share: "1"}], alternatives: []}},
      {...base, id: "finame-linha", label: "Finame da linha de embalagem", lenderKind: "development_bank", rate: {kind: "fixed", annualRates: same("0.109")},
        draws: q({2: "14.4"}), principal: same("0"), charges: [], security: {kind: "financed_asset", amount: "0", countsAgainstBasket: false},
        afterHorizon: {kind: "not_tested", reason: "Cronograma de amortização do Finame da linha não adotado"}},
      {...base, id: "ccb-alongamento", label: "CCB de cinco anos, R$ 70 mi", lenderKind: "bank", rate: {kind: "index_plus_spread", spreads: same("0.025")},
        draws: q({2: "70"}), principal: same("0"),
        charges: [{id: "comissao", periodEnd: "2027-03-31", category: "origination_fee", amount: "0.7"}, {id: "iof", periodEnd: "2027-03-31", category: "tax", amount: "2.3611"}],
        security: {kind: "receivables", amount: "21", countsAgainstBasket: true},
        afterHorizon: {kind: "scheduled", shares: [{year: 2029, share: third}, {year: 2030, share: third}, {year: 2031, share: third}], alternatives: []}},
      {...base, id: "debenture-90", label: "Debênture da 2ª emissão, R$ 90 mi", lenderKind: "capital_markets", rate: {kind: "index_plus_spread", spreads: same("0.029")},
        interestEvery: "semester", couponTreatment: "accrued_until_paid", draws: q({2: "90"}), principal: same("0"),
        charges: [{id: "emissao", periodEnd: "2027-03-31", category: "origination_fee", amount: "1.8"}], security: {kind: "none", amount: "0", countsAgainstBasket: false},
        afterHorizon: {kind: "not_tested", reason: "Perfil de amortização da emissão de R$ 90 mi não definido"}},
      {...base, id: "debenture-80", label: "Debênture da 2ª emissão, R$ 80 mi", lenderKind: "capital_markets", rate: {kind: "index_plus_spread", spreads: same("0.029")},
        interestEvery: "semester", couponTreatment: "accrued_until_paid", draws: q({2: "80"}), principal: same("0"),
        charges: [{id: "emissao", periodEnd: "2027-03-31", category: "origination_fee", amount: "1.6"}], security: {kind: "none", amount: "0", countsAgainstBasket: false},
        afterHorizon: {kind: "scheduled", shares: [2029, 2030, 2031, 2032, 2033].map((year) => ({year, share: "0.2"})),
          alternatives: [{id: "cinco-anos", label: "Amortização de 2029 a 2031", shares: [{year: 2029, share: third}, {year: 2030, share: third}, {year: 2031, share: third}]}]}},
      {...base, id: "ccb-bradesco-aditada", label: "CCB Bradesco alongada até 2029", role: "amended", replaces: "ccb-bradesco", lenderKind: "bank", openingPrincipal: "40", finalPaymentDate: "2029-09-15",
        rate: {kind: "index_plus_spread", spreads: q({0: "0.026", 1: "0.026"}, "0.028")}, draws: same("0"), principal: same("0"),
        charges: [{id: "tarifa", periodEnd: "2027-03-31", category: "origination_fee", amount: "0.4"}, {id: "iof", periodEnd: "2027-03-31", category: "tax", amount: "1.3492"}],
        security: {kind: "receivables", amount: "12", countsAgainstBasket: true}, prepayment: {basis: "flat", rate: "0.01"},
        afterHorizon: {kind: "scheduled", shares: [{year: 2029, share: "1"}], alternatives: []}},
    ],
    paths: [
      {id: "manter", label: "Manter e rolar no vencimento", role: "status_quo", projectVariantId: "seguir", instrumentIds: [...existing], prepayments: [], charges: []},
      {id: "ccb-tres-anos", label: "CCB de três anos para safra e capex", role: "candidate", projectVariantId: "seguir", instrumentIds: [...existing, "ccb-tres-anos"], prepayments: [], charges: []},
      {id: "alongar-com-banco", label: "Separar por uso e alongar 2027 com banco", role: "candidate", projectVariantId: "seguir",
        instrumentIds: [...existing, ...seasonal("giro-4t26-27"), "finame-linha", "ccb-alongamento"], prepayments: [{instrumentId: "ccb-bradesco", periodEnd: "2027-03-31"}], charges: waiver},
      {id: "debenture-com-linha", label: "Separar por uso e nova debênture que substitui a de 2021 e o Bradesco", role: "candidate", projectVariantId: "seguir",
        instrumentIds: [...existing, ...seasonal("giro-4t26-27"), "finame-linha", "debenture-90"], prepayments: prepayBoth, charges: []},
      {id: "alongar-bradesco", label: "Alongar só o Bradesco por dois anos", role: "candidate", projectVariantId: "seguir",
        instrumentIds: ["debenture-2021", "ccb-bradesco-aditada", "finame", ...seasonal("giro-4t26-27"), "finame-linha"], prepayments: [], charges: []},
      {id: "adiar-linha", label: "Adiar a linha de embalagem doze meses", role: "candidate", projectVariantId: "adiar-12",
        instrumentIds: [...existing, ...seasonal("giro-4t26-27")], prepayments: [], charges: []},
      {id: "sem-linha-debenture", label: "Sem a linha agora: giro de R$ 17 mi e debênture de R$ 80 mi", role: "candidate", projectVariantId: "sem-linha",
        instrumentIds: [...existing, ...seasonal("giro-4t26-17"), "debenture-80"], prepayments: prepayBoth, charges: []},
      {id: "banco-sem-linha", label: "Sem a linha: giro de R$ 17 mi e alongamento bancário de R$ 70 mi", role: "companion", projectVariantId: "sem-linha",
        instrumentIds: [...existing, ...seasonal("giro-4t26-17"), "ccb-alongamento"], prepayments: [{instrumentId: "ccb-bradesco", periodEnd: "2027-03-31"}], charges: waiver},
      {id: "bradesco-sem-linha", label: "Sem a linha: giro de R$ 17 mi e só o Bradesco alongado", role: "companion", projectVariantId: "sem-linha",
        instrumentIds: ["debenture-2021", "ccb-bradesco-aditada", "finame", ...seasonal("giro-4t26-17")], prepayments: [], charges: []},
    ],
    postHorizon: {years: [2029, 2030, 2031, 2032, 2033], ebitda: ["61.2", "63.6", "66.1", "68.7", "71.5"], leasePayments: ["3", "3", "3", "3", "3"], maintenanceCapex: ["8", "8", "8", "8", "8"],
      workingCapitalInvestment: ["2.5", "2.5", "2.5", "2.5", "2.5"], depreciation: ["12", "12", "12", "12", "12"], otherInterest: ["1.4", "1.4", "1.4", "1.4", "1.4"]},
    plan: {maximumSpread: "0.03", soundingBy: "2026-10-31", routeDecisionBy: "2026-11-15"},
    sensitivities: [
      {id: "trigo", label: "Trigo 15% mais caro com repasse em quatro meses: EBITDA de 2027 de 52,64, nível do cenário informado da C24", ebitdaDelta: q({2: "-0.98985638", 3: "-0.98985638", 4: "-0.98985638", 5: "-0.98985636"}), workingCapitalDelta: same("0"), minimumCash: null},
      {id: "prazo-redes-60", label: "Prazo das redes de 50 para 60 dias", ebitdaDelta: same("0"), workingCapitalDelta: q({1: "-12.24305555", 5: "-0.63611112", 9: "-0.62083333"}), minimumCash: null},
      {id: "caixa-minimo-25", label: "Política da companhia com caixa mínimo de R$ 25 mi", ebitdaDelta: same("0"), workingCapitalDelta: same("0"), minimumCash: "25"}],
    demandQuantum: "0.01",
  };
}

export const capitalPathsQuestion = "Precisamos financiar a linha nova de embalagem e reduzir a pressão dos vencimentos dos próximos dois anos. Que caminhos fazem sentido?";

/** The calibration as adopted contributions, one per operand, in the paths the premises propose, read back by
 * the composer. `edit` changes contributions before the basis is sealed. */
export function auroraCapitalPathsBasis(k: CapitalStructurePathsInput = auroraCapitalPathsKernel()) {
  const f = analysisTestBasis(`capital_paths.${id(97)}.`, k.openingDate, k.periodEnds.at(-1)!);
  for (const c of encodeCapitalPaths(k)) f.contribute(c.path, c.unit, c.value as AdoptionBasisEntry["value"]);
  const seal = (question = capitalPathsQuestion): CapitalPathsPacketInput => {
    const envelope = f.seal();
    return composeBoundCapitalPaths({envelope, scope: f.context.scope, question});
  };
  return {...f, seal};
}
export const auroraCapitalPathsAnalysis = (k?: CapitalStructurePathsInput): AdoptedCapitalPathsInput => auroraCapitalPathsBasis(k).seal().analysis;

/** The facts of ficha C32 with their origin, for the premises path: the same calibration the basis above adopts. */
export function auroraCapitalPathsFacts(k: CapitalStructurePathsInput = auroraCapitalPathsKernel()): CapitalPathsFacts {
  const fact = <T>(value: T, origin: CapitalPathsFacts["minimumCash"]["origin"], source: string) => ({value, origin, source});
  const instrumentSource: Record<string, [CapitalPathsFacts["minimumCash"]["origin"], string]> = {
    "debenture-2021": ["document", "Escritura da debênture de 2021 e tabela de dívida de junho de 2026"], "ccb-bradesco": ["document", "Contrato da CCB do Bradesco de setembro de 2024"],
    "finame": ["document", "Tabela de dívida de junho de 2026; SAC mensal até dezembro de 2030"],
    "giro-4t26-27": ["market", "Giro de seis meses, CDI mais 2,0 a 3,0; IOF e comissão da regra da casa (C32)"], "giro-4t26-17": ["market", "Giro de seis meses de R$ 17 mi sem a linha (C32, turno 2)"],
    "giro-4t27": ["market", "Giro da safra de 2027, CDI mais 2,0 (C32)"], "giro-4t28": ["market", "Giro da safra de 2028, recomposto em março (C32)"],
    "ccb-tres-anos": ["document", "Term sheet do Itaú da ficha 1: R$ 30 mi, três anos, CDI mais 2,1, cessão de 130%"], "finame-linha": ["estimate", "Finame do equipamento, TLP mais 3,0, elegibilidade a confirmar"],
    "ccb-alongamento": ["market", "CCB de cinco anos com dois de carência, CDI mais 2,2 a 2,8, sete operações em 180 dias"],
    "debenture-90": ["market", "Debênture CVM 160 sem garantia, CDI mais 2,5 a 3,4, amostra de cinco emissões"], "debenture-80": ["market", "Debênture CVM 160 sem garantia, CDI mais 2,5 a 3,4; amortização de 2029 a 2033 (C04)"],
    "ccb-bradesco-aditada": ["estimate", "Aditamento hipotético da CCB do Bradesco até setembro de 2029, CDI mais 2,8 com tarifa e IOF (C32, turno 4)"]};
  return {capitalPathsId: id(9700), entityId: id(1), perimeter: "standalone", currency: k.currency, definitionVersionId: id(3), openingDate: k.openingDate,
    company: fact({periodEnds: k.periodEnds, openingAvailable: k.openingAvailable, operating: k.operating}, "estimate", "Caixa de junho de 2026 (gerencial) e projeção por drivers da C32"),
    minimumCash: fact(k.minimumCash, "house", "Caixa mínimo de cerca de duas semanas de desembolso operacional"),
    index: fact(k.index, "market", "Curva DI de referência do cenário em 14/08/2026; 12% de 2029 a 2033 (C04)"),
    tax: fact(k.tax, "document", "Lucro real, 34%"),
    variants: k.projectVariants.map((v) => fact(v, v.effects ? "analysis" : "house", v.effects ? "Análise do projeto da linha de embalagem (C32): economia, manutenção, giro da partida e capex" : "Caminho sem a linha até a revisão")),
    stress: fact(k.stress, "house", "Caso que um banco tende a usar, EBITDA 15% menor"),
    indenture: fact({ebitdaExcludesLeases: k.covenant.ebitdaExcludesLeases, history: k.covenant.history, indenture: k.covenant.indenture}, "document", "Escritura de 2021 com o aditamento de 2023; EBITDA do 1S26 da CVM 156"),
    policy: k.covenant.policy ? fact(k.covenant.policy, "document", "Ata do conselho de março de 2026; EBITDA da política ainda não definido") : null,
    basket: k.basket ? fact(k.basket, "document", "Negative pledge da escritura e cessão do Bradesco de 2024") : null,
    instruments: k.instruments.map((i) => fact(i, instrumentSource[i.id]![0], instrumentSource[i.id]![1])),
    paths: k.paths.map((p) => fact(p, "house", p.role === "companion" ? "Caminho de apoio para o plano alternativo e para a pergunta do Bradesco" : "Caminho da ficha C32")),
    postHorizon: fact(k.postHorizon, "analysis", "Base anual de 2029 a 2033 da ficha C04"),
    plan: fact(k.plan, "house", "Gatilho de CDI mais 3,0 e calendário de sondagem e decisão da C32"),
    sensitivities: k.sensitivities.map((s) => fact(s, "analysis", s.id === "caixa-minimo-25" ? "Variação da regra da casa da C32" : "Cenários da projeção por drivers (C24)")),
    demandQuantum: fact(k.demandQuantum, "house", "Resolução de R$ 10 mil")};
}
