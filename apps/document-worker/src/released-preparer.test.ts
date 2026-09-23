import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";
import {prepareReceivablesExecutionInput} from "./receivables-preparer-entry";
import {loadReleasedPreparer,verifyInstalledPreparers} from "./released-preparer";
import {releasedPreparers} from "./released-preparers.generated";

const fixture = () => JSON.parse(readFileSync(new URL("../../../packages/testing-fixtures/assets/receivables-preparation/synthetic-complete.json",import.meta.url),"utf8"));
describe("immutable technical preparation", () => {
  it("replays the complete synthetic source history with identical input bytes and value origins", () => {
    const {synthetic,input} = fixture();
    expect(synthetic).toBe(true);
    const release = loadReleasedPreparer(releasedPreparers[0]!.id);
    const prepared = release.preparer.prepareReceivablesExecutionInput(input);
    expect(prepared).toEqual(prepareReceivablesExecutionInput(input));
    expect(prepared.assembly.input.case.portfolio).toHaveLength(2);
    expect(prepared).not.toHaveProperty("ready");
    expect(prepared).not.toHaveProperty("output");
    expect(verifyInstalledPreparers()).toBe(1);
  });
  it("refuses unavailable versions without dispatching to the current preparer", () => {
    expect(() => loadReleasedPreparer("r01-preparation.unpublished")).toThrow("preparer_release_unavailable");
  });
  it("does not let a consumer mutate later release lookup or the loaded interface", () => {
    const id = releasedPreparers[0]!.id;
    const loaded = loadReleasedPreparer(id);
    expect(Reflect.set(loaded.release,"artifactHash","0".repeat(64))).toBe(false);
    expect(Reflect.set(loaded.preparer,"prepareReceivablesExecutionInput",() => ({ready:true}))).toBe(false);
    expect(loadReleasedPreparer(id).release).toEqual(loaded.release);
    expect(loadReleasedPreparer(id).preparer.prepareReceivablesExecutionInput).toBe(loaded.preparer.prepareReceivablesExecutionInput);
  });
  it("preserves authority denials in the packaged artifact", () => {
    const {input} = fixture();
    const {preparer} = loadReleasedPreparer(releasedPreparers[0]!.id);
    expect(() => preparer.prepareReceivablesExecutionInput({...input,history:[]})).toThrow("history_incomplete");
    expect(() => preparer.prepareReceivablesExecutionInput({...input,confirmedScope:null})).toThrow("scope_confirmation_required");
    const changed = structuredClone(input);
    changed.history[0].patch.sections.accounting.value.allowanceBalance = "999";
    expect(() => preparer.prepareReceivablesExecutionInput(changed)).toThrow("document_patch_changed");
  });
});
