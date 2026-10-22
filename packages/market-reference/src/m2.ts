/** M2 contracts of the market reference layer (ADR 0023): the Selic target series, Copom
 * communiqués, availability, quality, per-period selection and canonical v2. A separate entry point,
 * so the released methods that import the package root do not pin these sources. */
export * from "./market-availability";
export * from "./selic-target-contract";
export * from "./selic-target-quality";
export * from "./market-period-selection";
export * from "./market-canonical-v2";
export * from "./strict-json";
export * from "./market-odbl";
