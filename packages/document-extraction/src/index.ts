/**
 * @offroad/document-extraction — layer + ontology → cited candidates (P1 plan §7, stage E3).
 *
 * The piece between "we can read the file" and "we know what it says". It holds no I/O: it is
 * given a parsed layer and a gateway, and it returns candidates that have already been checked
 * against the document they claim to come from.
 */
export const documentExtractionVersion = "2026.08.19-e3-v1";

export * from "./evidence";
export * from "./prompt";
export * from "./extract";
