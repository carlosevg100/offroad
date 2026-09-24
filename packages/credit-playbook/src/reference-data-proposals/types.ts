import type {ReferenceDataEntry} from "../reference-data";

/**
 * A value prepared by the Offroad executor for the founder's review. It enters the registry as a
 * draft: methods and screens see it as "em rascunho" and treat it as a gap, so it never changes a
 * calculation until its owner approves it with a dated source and an expiry.
 */
export type ReferenceDataProposal = {
  /** Version of this proposal, independent of the registry version: YYYY.MM.DD-vN. */
  version: string;
  value: NonNullable<ReferenceDataEntry["value"]>;
  unit: string | null;
  /** The governing source; `observedBy` records who prepared it and that it awaits review. */
  source: NonNullable<ReferenceDataEntry["source"]>;
  /** The date the value was established against its sources. */
  asOf: string;
  /** Parameter card that carries the full professional text: `knowledge/reference-data/<file>.md#<anchor>`. */
  documentation: string;
};

export type ReferenceDataProposalFamily = Readonly<Record<string, ReferenceDataProposal>>;
