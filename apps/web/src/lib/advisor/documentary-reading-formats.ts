import type {DeliverableContext, DeliverableType} from "@offroad/case-export/deliverable-formats";

/** A documentary reading is one deliverable: a qualitative reading of the documents provided. */
export const documentaryReadingDeliverableTypes: readonly DeliverableType[] = ["documentary_reading"];

/**
 * Context for the format policy. The reader already refuses a superseded, cross-project or
 * unauthorized reading before this runs, so what remains to declare is what the delivery is:
 * qualitative text with sourced observations, without a tabular or presentation contract of its
 * own. That is why a spreadsheet and a deck are never offered here.
 */
export function documentaryReadingDeliverableContext(overrides: Partial<DeliverableContext> = {}): DeliverableContext {
  return {
    resultState: "current",
    accessCurrent: true,
    reproduction: "not_applicable",
    tabularContract: false,
    narrativeStructure: false,
    ...overrides,
  };
}
