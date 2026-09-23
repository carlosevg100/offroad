import {createHash} from "node:crypto";
import {executionCanonicalText, executionInputFingerprint} from "@offroad/agent-contracts";
import {
  assembleReceivablesPoolMethodInput, compileReceivablesSupplementDraft,
  receivablesSupplementDraftSchema, type ReceivablesPhaseOneInput,
  type ReceivablesPoolInputAssembly, type ReceivablesSupplementDraft,
} from "@offroad/receivables-analysis";

type EvidenceReference = {sourceClass: "provided_document" | "project_context" | "house_method" | "user_confirmation"; sourceId: string; anchor: string};
type DraftOrigin = {kind: "draft"; path: string; value: unknown; patchIds: string[]; references: EvidenceReference[]};
type UniverseOrigin = {kind: "universe"; collection: "receivables" | "settlements"; id: string; field: string; source: unknown};
type ScopeOrigin = {kind: "scope"; field: "reportingDate" | "currency" | "universeId"};
type PreparerOrigin = {kind: "preparer"; rule: string};
export type ReceivablesValueOrigin = DraftOrigin | UniverseOrigin | ScopeOrigin | PreparerOrigin;
export type ReceivablesPreparedValue = {path: string; value: unknown; origins: ReceivablesValueOrigin[]};
const hash = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
const pointer = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");

/** Include empty arrays/objects as values too: an empty list may change eligibility. */
function leaves(value: unknown, path = ""): Array<{path: string; value: unknown}> {
  if (value !== null && typeof value === "object") {
    const entries = Object.entries(value);
    if (entries.length) return entries.flatMap(([key, child]) => leaves(child, `${path}/${pointer(key)}`));
  }
  return [{path, value}];
}

function draftOrigin(draft: ReceivablesSupplementDraft, section: string, path: string): DraftOrigin {
  const fieldEntry = Object.entries(draft.fields).find(([key]) => path === key || path.startsWith(`${key}/`));
  const stored = fieldEntry?.[1] ?? draft.sections[section as keyof typeof draft.sections];
  if (!stored) throw new Error("receivables_preparation_draft_value_missing");
  const root = fieldEntry ? `/fields/${pointer(fieldEntry[0])}/value` : `/sections/${section}/value`;
  const suffix = path.slice((fieldEntry?.[0] ?? `/${section}`).length);
  let value = stored.value;
  for (const encoded of suffix.split("/").slice(1)) {
    const key = encoded.replace(/~1/g,"/").replace(/~0/g,"~");
    if (value === null || typeof value !== "object" || !Object.hasOwn(value,key)) throw new Error("receivables_preparation_draft_path_missing");
    value = (value as Record<string,unknown>)[key];
  }
  return {kind: "draft", path: `${root}${suffix}`, value,
    patchIds: [...stored.patchIds].sort(), references: stored.sources};
}

/** Build the input and its origin map together. This is a worker assertion, not authority:
 * the SQL receipt must resolve every reference against persisted, currently permitted objects. */
export function prepareReceivablesInputWithOrigins(input: {
  phaseOne: ReceivablesPhaseOneInput;
  draft: unknown;
}): {
  assembly: ReceivablesPoolInputAssembly; inputText: string; inputFingerprint: string;
  draftFingerprint: string; values: ReceivablesPreparedValue[];
  evidence: Array<{path: string; references: EvidenceReference[]}>;
} {
  const draft = receivablesSupplementDraftSchema.parse(input.draft);
  if (draft.sourceDatasetHash !== input.phaseOne.datasetHash) throw new Error("receivables_preparation_dataset_mismatch");
  const compiled = compileReceivablesSupplementDraft(draft);
  if (compiled.state !== "complete" || !compiled.supplement) throw new Error("receivables_preparation_draft_not_complete");
  const assembly = assembleReceivablesPoolMethodInput({phaseOne: input.phaseOne, supplement: compiled.supplement});
  const inputText = executionCanonicalText(assembly.input);
  const universe = input.phaseOne.universe;
  const originalFields: Record<string,string> = {debtorId:"obligorId",debtorGroupId:"economicGroupId",originDate:"issueDate",dueDate:"currentDueDate",originalAmount:"faceValue",outstandingBalance:"openValue"};
  const values = leaves(assembly.input).map(({path,value}): ReceivablesPreparedValue => {
    let origins: ReceivablesValueOrigin[];
    if (path === "/currency") origins = [{kind:"scope",field:"currency"}];
    else if (path === "/case/id") origins = [{kind:"scope",field:"universeId"},{kind:"preparer",rule:"method-case-id"}];
    else if (path === "/case/schemaVersion") origins = [{kind:"preparer",rule:"published-input-schema"}];
    else if (path === "/case/referenceDate") origins = [{kind:"scope",field:"reportingDate"}];
    else if (path.startsWith("/case/portfolio/")) {
      const [, , , index, field] = path.split("/");
      const title = universe.receivables[Number(index)];
      if (!title || !field) throw new Error("receivables_preparation_title_missing");
      const origin = (key:string): UniverseOrigin => ({kind:"universe",collection:"receivables",id:title.id,field:key,source:title.source});
      if (originalFields[field]) origins = [origin(originalFields[field])];
      else if (field === "paidAmount") origins = [origin("id"), ...universe.settlements.filter(event => event.receivableId === title.id)
        .map(event => ({kind:"universe" as const,collection:"settlements" as const,id:event.id,field:"amount",source:event.source})),{kind:"preparer",rule:"sum-settlements-decimal-2"}];
      else if (field === "id") origins = [origin("id"),{kind:"preparer",rule:"method-title-id"}];
      else if (["sourceDocumentId","sourceAnchor","anchorVerified"].includes(field)) origins = [origin("source"),{kind:"preparer",rule:"source-anchor-projection"}];
      else {
        const titleIndex = compiled.supplement!.titles.findIndex(item => item.sourceReceivableId === title.id);
        origins = [draftOrigin(draft,"titles",`/titles/${titleIndex}/${field}`),origin("id")];
      }
    } else if (path.startsWith("/case/")) {
      const section = path.split("/")[2]!;
      if (!["cedent","cashReceipts","accounting","policy","structure"].includes(section)) throw new Error("receivables_preparation_unmapped_value");
      const draftPath = section === "cashReceipts" && path.endsWith("/receivableId")
        ? path.slice("/case".length).replace(/\/receivableId$/, "/sourceReceivableId") : path.slice("/case".length);
      origins = [draftOrigin(draft,section,draftPath)];
      if (section === "cashReceipts" && path.endsWith("/receivableId")) origins.push({kind:"preparer",rule:"cash-title-link"});
    } else throw new Error("receivables_preparation_unmapped_value");
    return {path,value,origins};
  });
  const evidence = Object.entries(assembly.evidence).map(([section,references]) => ({path:`/evidence/${section}`,references}));
  assembly.findingResolutions.forEach((finding,index) => evidence.push({path:`/findingResolutions/${index}/evidence`,references:finding.evidence}));
  return {assembly,inputText,inputFingerprint:hash(inputText),draftFingerprint:executionInputFingerprint(draft),values,evidence};
}
