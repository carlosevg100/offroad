import {capitalLegalProposals} from "./capital-legal";
import {debtScenarioProposals} from "./debt-scenarios";
import {financialAnalysisProposals} from "./financial-analysis";
import {intakeMaterialsQcProposals} from "./intake-materials-qc";
import {pricingMarketProposals} from "./pricing-market";
import {structureProposals} from "./structure";
import type {ReferenceDataProposal, ReferenceDataProposalFamily} from "./types";

export type {ReferenceDataProposal, ReferenceDataProposalFamily} from "./types";

/** Every family owns its keys; a key proposed by two families is a defect, refused at load. */
export const referenceDataProposalFamilies = {
  "capital-legal": capitalLegalProposals,
  "financial-analysis": financialAnalysisProposals,
  "debt-scenarios": debtScenarioProposals,
  structure: structureProposals,
  "pricing-market": pricingMarketProposals,
  "intake-materials-qc": intakeMaterialsQcProposals,
} as const satisfies Record<string, ReferenceDataProposalFamily>;

export const referenceDataProposals: Readonly<Record<string, ReferenceDataProposal>> = Object.freeze(
  Object.values(referenceDataProposalFamilies).reduce<Record<string, ReferenceDataProposal>>((all, family) => {
    for (const [key, proposal] of Object.entries(family)) {
      if (Object.hasOwn(all, key)) throw new Error(`reference data proposal ${key} is declared by two families`);
      all[key] = proposal;
    }
    return all;
  }, {}),
);
