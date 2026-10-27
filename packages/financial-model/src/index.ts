/** Legacy indicative workbook version, retained for backward-compatible artifact replay. */
export const financialModelVersion = "2026.08.29-v1";
/** Integrated, assumption-governed institutional engine. */
export const institutionalFinancialModelVersion = "2026.09.09-v3";

export * from "./assumptions";
export * from "./governed-workbook";
export * from "./institutional-model";
export * from "./institutional-input";
export * from "./market-curves";
export * from "./model";
export * from "./review";
export * from "./sector-packs";
export * from "./workbook";

export * from "./approved-download";

export * from "./institutional-input-requests";

export * from "./institutional-assumption-answer";

export * from "./institutional-configuration";
export * from "./institutional-runtime";

export * from "./institutional-workbook";

export * from "./adopted-basis";

export * from "./capital-structure-decision";

export * from "./adopted-liquidity-calendar";
export * from "./adopted-debt-liquidity";

export * from "./adopted-numeric-representation";

export * from "./adopted-financing-costs";

export * from "./adopted-operating-projection";

export * from "./adopted-capital-period-cash";

export * from "./capital-decision-composition";

export * from "./adopted-defined-ratio";

export * from "./capital-decision-review";

export * from "./capital-decision-delivery";
export * from "./capital-contract-preparation";
export * from "./capital-contract-adoptions";
export * from "./capital-procedure-packet";

export * from "./capital-contract-preparation-v2";
export * from "./capital-procedure-packet-v2";

export * from "./capital-procedure-packet-composer";
export * from "./capital-chart-series";
export * from "./capital-md-test";

export {renderInstitutionalRoundtripWorkbook} from "./institutional-workbook";

export * from "./adopted-financing-proposal";

export * from "./adopted-relative-debt-cost";

export * from "./adopted-debt-capacity";
export * from "./adopted-investment-analysis";

export * from "./ficha-calculation-results";
export * from "./ficha-executor-contracts";
export * from "./investment-decision-packet";
export * from "./investment-decision-contracts";
export * from "./adopted-financing-comparison";
export * from "./financing-comparison-packet";
export * from "./financing-comparison-contracts";
export * from "./financing-comparison-composer";
export * from "./financing-comparison-premises";
export * from "./debt-capacity-premises";
export * from "./debt-capacity-composer";
export * from "./adopted-relative-cost-lens";
export * from "./relative-debt-cost-packet";
export * from "./relative-debt-cost-contracts";
export * from "./debt-capacity-packet";
export * from "./debt-capacity-contracts";
export * from "./investment-decision-composer";
export * from "./investment-premises";
export * from "./adopted-debt-table";
export * from "./debt-table-packet";
export * from "./adopted-covenant-headroom";
export * from "./covenant-headroom-packet";
export * from "./adopted-weekly-cash";
export * from "./weekly-cash-packet";
export * from "./debt-table-premises";
export * from "./debt-table-composer";
export * from "./covenant-headroom-premises";
export * from "./covenant-headroom-composer";
export * from "./weekly-cash-premises";
export * from "./weekly-cash-composer";
export * from "./adopted-operating-projection-drivers";
export * from "./operating-projection-results";
export * from "./operating-projection-packet";
export * from "./operating-projection-premises";
export * from "./operating-projection-composer";
export * from "./adopted-projection-challenge";
export * from "./projection-challenge-results";
export * from "./projection-challenge-packet";
export * from "./projection-challenge-premises";
export * from "./projection-challenge-composer";
export * from "./adopted-receivables-funding";
export * from "./receivables-funding-results";
export * from "./receivables-funding-packet";
export * from "./receivables-funding-premises";
export * from "./receivables-funding-composer";
export * from "./adopted-quarter-update";
export * from "./quarter-update-results";
export * from "./quarter-update-packet";
export * from "./quarter-update-premises";
export * from "./quarter-update-composer";
export * from "./quarter-update-stored-priors";
export * from "./document-folder-inventory";
export * from "./adopted-document-folder-inventory";
export * from "./document-folder-inventory-packet";
export * from "./document-folder-inventory-premises";
export * from "./document-folder-inventory-composer";
export * from "./adopted-evaluate-received-proposal";
export * from "./evaluate-received-proposal-results";
export * from "./evaluate-received-proposal-packet";
export * from "./evaluate-received-proposal-premises";
export * from "./evaluate-received-proposal-composer";
export * from "./capital-structure-paths-packet";
export * from "./adopted-capital-structure-paths";
export * from "./capital-structure-paths-results";
export * from "./capital-structure-paths-composer";
export * from "./capital-structure-paths-premises";
