import {describe, expect, it} from "vitest";
import {workspaceRequestContext} from "./workspace-context";
const a = "a11b0000-0000-4000-9000-000000000001";
const b = "a11b0000-0000-4000-9000-000000000002";
const path = "https://offroad.example/pt-BR/app";
describe("workspace request context", () => {
  it("keeps two tabs independently scoped", () => {
    expect(workspaceRequestContext(new URL(`${path}?workspace=${a}`), `${path}?workspace=${a}`, "POST")).toMatchObject({workspace:a, invalid:false});
    expect(workspaceRequestContext(new URL(`${path}?workspace=${b}`), `${path}?workspace=${b}`, "POST")).toMatchObject({workspace:b, invalid:false});
  });
  it("rejects a submit retargeted from another workspace", () => {
    expect(workspaceRequestContext(new URL(`${path}?workspace=${b}`), `${path}?workspace=${a}`, "POST")).toEqual({invalid:true});
  });
  it("preserves the source tab when following a legacy link", () => {
    expect(workspaceRequestContext(new URL(path), `${path}?workspace=${a}`, "GET")).toMatchObject({workspace:a, canonicalize:true});
  });
  it("does not inherit another origin's navigation context", () => {
    expect(workspaceRequestContext(new URL(path), `https://other.example/?workspace=${a}`, "GET").workspace).toBeUndefined();
  });
  it("rejects malformed and duplicate selection", () => {
    expect(workspaceRequestContext(new URL(`${path}?workspace=wrong`), null, "GET").invalid).toBe(true);
    expect(workspaceRequestContext(new URL(`${path}?workspace=${a}&workspace=${b}`), null, "GET").invalid).toBe(true);
  });
});
