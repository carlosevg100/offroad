import {
  assembleReceivablesPoolMethodInput,
  compileReceivablesSupplementDraft,
  receivablesPoolInputAssemblySchema,
  receivablesSupplementDraftSchema,
  type ReceivablesPhaseOneInput,
  type ReceivablesPoolInputAssembly,
} from "@offroad/receivables-analysis";

export type ReceivablesMethodInputResolution = {
  assembly: ReceivablesPoolInputAssembly | null;
  origin: "stored_assembly" | "compiled_draft" | "none";
  draftState: "complete" | "incomplete" | "conflicted" | "stale" | "missing";
  missingSections: readonly string[];
  openConflictIds: readonly string[];
};

/** A stored assembly is a historical projection, never authority over a present draft.
 * Recompile the current, complete and conflict-free draft against this dataset. When a draft
 * exists but cannot compile, report its debt instead of reviving a previous result. */
export function resolveReceivablesMethodInput(input: {
  phaseOne: ReceivablesPhaseOneInput;
  storedAssembly?: unknown | null;
  supplementDraft?: unknown | null;
}): ReceivablesMethodInputResolution {
  if (!input.supplementDraft && input.storedAssembly) {
    const parsed = receivablesPoolInputAssemblySchema.safeParse(input.storedAssembly);
    if (parsed.success && parsed.data.source.datasetHash === input.phaseOne.datasetHash) {
      return {assembly: parsed.data, origin: "stored_assembly", draftState: "missing", missingSections: [], openConflictIds: []};
    }
  }
  if (!input.supplementDraft) {
    return {assembly: null, origin: "none", draftState: "missing", missingSections: [], openConflictIds: []};
  }
  const draft = receivablesSupplementDraftSchema.parse(input.supplementDraft);
  if (draft.sourceDatasetHash !== input.phaseOne.datasetHash) {
    return {assembly: null, origin: "none", draftState: "stale", missingSections: [], openConflictIds: []};
  }
  const compiled = compileReceivablesSupplementDraft(draft);
  if (compiled.state !== "complete" || !compiled.supplement) {
    return {
      assembly: null,
      origin: "none",
      draftState: compiled.state,
      missingSections: compiled.missingSections,
      openConflictIds: compiled.openConflictIds,
    };
  }
  return {
    assembly: assembleReceivablesPoolMethodInput({phaseOne: input.phaseOne, supplement: compiled.supplement}),
    origin: "compiled_draft",
    draftState: "complete",
    missingSections: [],
    openConflictIds: [],
  };
}
