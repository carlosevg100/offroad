/**
 * The composition of an execution request, shared by the web request action and the worker's
 * dependency recompute: the basis the server assembles, the contract, the professional gates and
 * the capital request that ties them together. Pure and deterministic given its ids and clock.
 */
export * from "./contract";
export * from "./gates";
export * from "./compose";
export type {ExecutionGateRefusal} from "./refusal";
