import {describe, expect, it} from "vitest";
import {compiledMethodAdapters} from "./compiled-method-adapters";
// @ts-expect-error build tooling module without type declarations
import {compiledExecutorAdapters} from "../../../packages/credit-playbook/scripts/compiled-executor-adapters.mjs";

describe("compiled method adapters", () => {
  it("mirrors the reviewed build table exactly", () => {
    expect(compiledMethodAdapters.map(a => ({...a, exports: {...a.exports}}))).toEqual(
      (compiledExecutorAdapters as {methodId: string; executorKey: string; executorVersion: string; exports: object}[])
        .map(({methodId, executorKey, executorVersion, exports}) => ({methodId, executorKey, executorVersion, exports: {...exports}})));
  });
});
