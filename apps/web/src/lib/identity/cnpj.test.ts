import {describe, expect, it} from "vitest";
import {normalizeCnpj} from "./cnpj";

describe("CNPJ", () => {
  it("accepts a valid numeric CNPJ with or without formatting", () => {
    expect(normalizeCnpj("11.222.333/0001-81")).toBe("11222333000181");
    expect(normalizeCnpj("11222333000181")).toBe("11222333000181");
  });
  it("accepts the alphanumeric CNPJ of the Receita Federal", () => {
    expect(normalizeCnpj("12.ABC.345/01DE-35")).toBe("12ABC34501DE35");
  });
  it("refuses wrong check digits, repeated digits and wrong length", () => {
    for (const v of ["11.222.333/0001-82", "00000000000000", "1122233300018", "12ABC34501DE3A"]) expect(normalizeCnpj(v)).toBeNull();
  });
});
