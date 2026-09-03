import type {ProfessionalContextCopy} from "./professional-context-form";

type Translator = (key: string) => string;

export function professionalContextCopy(t: Translator): ProfessionalContextCopy {
  return {
    eyebrow: t("eyebrow"),
    title: t("title"),
    body: t("body"),
    institutionName: t("institutionName"),
    institutionPlaceholder: t("institutionPlaceholder"),
    affiliationLegend: t("affiliationLegend"),
    affiliation: {
      company: t("affiliation.company"), bank: t("affiliation.bank"), advisory: t("affiliation.advisory"),
      asset_manager: t("affiliation.assetManager"), credit_fund: t("affiliation.creditFund"),
      family_office: t("affiliation.familyOffice"), independent: t("affiliation.independent"), other: t("affiliation.other"),
    },
    role: t("role"),
    rolePlaceholder: t("rolePlaceholder"),
    roles: {
      cfo_treasury: t("roles.cfoTreasury"), corporate_finance: t("roles.corporateFinance"),
      fp_and_a: t("roles.fpAndA"), controller_accounting: t("roles.controllerAccounting"),
      dcm_banker: t("roles.dcmBanker"), corporate_banker: t("roles.corporateBanker"),
      relationship_manager: t("roles.relationshipManager"), structured_finance_banker: t("roles.structuredFinanceBanker"),
      project_finance_banker: t("roles.projectFinanceBanker"), syndicate_distribution: t("roles.syndicateDistribution"),
      advisor: t("roles.advisor"),
      investor_lender: t("roles.investorLender"), portfolio_manager: t("roles.portfolioManager"),
      credit_analyst: t("roles.creditAnalyst"), risk_underwriter: t("roles.riskUnderwriter"),
      investment_committee: t("roles.investmentCommittee"), legal_structuring: t("roles.legalStructuring"),
      analyst: t("roles.analyst"), executive: t("roles.executive"), board_shareholder: t("roles.boardShareholder"),
      other: t("roles.other"),
    },
    team: t("team"),
    teamPlaceholder: t("teamPlaceholder"),
    operatingLegend: t("operatingLegend"),
    operatingBody: t("operatingBody"),
    operating: {
      raise_capital: t("operating.raiseCapital"), balance_sheet_lending: t("operating.balanceSheetLending"),
      structuring: t("operating.structuring"), distribution: t("operating.distribution"),
      advisory: t("operating.advisory"), investing: t("operating.investing"),
    },
    objectiveLegend: t("objectiveLegend"),
    objectiveBody: t("objectiveBody"),
    objectives: {
      understand_company: t("objectives.understandCompany"), prepare_meetings: t("objectives.prepareMeetings"),
      originate_ideas: t("objectives.originateIdeas"), evaluate_capital_options: t("objectives.evaluateCapitalOptions"),
      structure_transactions: t("objectives.structureTransactions"), prepare_materials: t("objectives.prepareMaterials"),
      connect_capital: t("objectives.connectCapital"), analyze_investments: t("objectives.analyzeInvestments"),
    },
    optionalTitle: t("optionalTitle"),
    optionalBody: t("optionalBody"),
    products: {
      bilateral_credit: t("products.bilateralCredit"), club_syndicated: t("products.clubSyndicated"),
      capital_markets: t("products.capitalMarkets"), securitization: t("products.securitization"),
      asset_backed: t("products.assetBacked"), project_acquisition_finance: t("products.projectAcquisitionFinance"),
      trade_export_agri: t("products.tradeExportAgri"), structured_flexible_capital: t("products.structuredFlexibleCapital"),
      special_situations: t("products.specialSituations"), derivatives_hedging: t("products.derivativesHedging"),
    },
    notes: t("notes"),
    notesPlaceholder: t("notesPlaceholder"),
    save: t("save"),
    skip: t("skip"),
    assurance: t("assurance"),
  };
}
