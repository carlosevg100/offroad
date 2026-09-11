import {renderApprovedInstitutionalFinancialWorkbook, type InstitutionalWorkbookArtifact} from "@offroad/financial-model";
import type {Material} from "@offroad/case-materials";

import {institutionalResultMaterial} from "./institutional-result-material";

/**
 * Regenerating the deliverables of one revision.
 *
 * Institutional deliverables are not stored files: the workbook bytes and the narrative material
 * are both derived from the result artifact whenever somebody asks for them. That is what makes
 * propagation honest. A new approved revision produces a new result, and the files that come out
 * of it are new because the result is new, not because anything was rewritten in place. The
 * previous result keeps its own artifact, so its files stay reproducible byte for byte.
 *
 * This is the one function the regeneration goes through. It refuses rather than guesses: if the
 * workbook does not replay to the hash recorded with the approval, nothing is returned, because
 * blessing new bytes under an old approval is exactly the failure this whole gap is about.
 */
export type InstitutionalRevisionDeliverable = {
  resultId: string;
  revisionId: string | null;
  standing: "current" | "previous";
  producedAt: string;
  /** The approved workbook, replayed and hash-verified against the approval record. */
  workbook: Uint8Array;
  /** The narrative appendices, derived from the same verified snapshot. */
  material: Material;
};

export async function institutionalRevisionDeliverable(input: {
  resultId: string;
  revisionId: string | null;
  standing: "current" | "previous";
  producedAt: string;
  artifact: InstitutionalWorkbookArtifact;
  lang: "pt" | "en";
}): Promise<InstitutionalRevisionDeliverable | null> {
  const workbook = await renderApprovedInstitutionalFinancialWorkbook(input.artifact, input.lang);
  if (!workbook) return null;
  return {
    resultId: input.resultId,
    revisionId: input.revisionId,
    standing: input.standing,
    producedAt: input.producedAt,
    workbook,
    material: institutionalResultMaterial(input.artifact, input.lang),
  };
}
