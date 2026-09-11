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

export * from "./institutional-revision-difference";

export * from "./institutional-workbook-import";
