/**
 * @offroad/document-classification — layer + ontology → what this document is (P1 plan §7, stage E1).
 *
 * The sibling of `@offroad/document-extraction`, and split out of the worker for the same
 * reason that one was: a stage that only exists inside the worker is a stage nothing can
 * measure. E3 has had a number for weeks (recall and precision against a gold case) because it
 * could be run outside the container; E1 had none, and "how often do we know what a document is"
 * is the question that decides which field set E3 is even asked for. A wrong kind is not a small
 * error downstream, it is the wrong extraction.
 *
 * Holds no I/O: it is given a parsed layer and a gateway, and returns a profile.
 */
export const documentClassificationVersion = "2026.08.20-e1-v1";

export * from "./classify";
