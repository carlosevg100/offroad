import {describe,it,expect} from "vitest";
import {normalizeDeclaredAssumptionValue as normalize} from "./assumption-unit";
describe("declared assumption units",()=>{
 it("converts explicit percent exactly",()=>expect(normalize("0.125","percent").value).toBe("0.00125"));
 it("preserves declared currency amount",()=>expect(normalize("12.50","currency").value).toBe("12.5"));
 it.each(["NaN","Infinity","1e2","12%","1,000",""])("rejects %s",value=>expect(()=>normalize(value,"percent")).toThrow());
});
