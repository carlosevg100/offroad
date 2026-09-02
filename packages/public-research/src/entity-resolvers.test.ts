import {describe, expect, it} from "vitest";
import {createCvmOpenDataEntityResolver, createSecEdgarEntityResolver, resolveOfficialEntity} from "./entity-resolvers";

describe("official entity resolution", () => {
  it("resolves a Brazilian issuer from the CVM official registry without retaining contact fields", async () => {
    const csv = [
      "CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;CD_CVM;SETOR_ATIV;SIT;SIT_EMISSOR;EMAIL",
      "64.904.295/0001-03;CAMIL ALIMENTOS S.A.;CAMIL;24228;Alimentos;ATIVO;FASE OPERACIONAL;ri@example.com",
      "00.000.000/0001-00;CAMIL EMPREENDIMENTOS S.A.;CAMIL EMPREENDIMENTOS;99999;Imobiliário;CANCELADA;CANCELADO;other@example.com",
    ].join("\n");
    const resolver = createCvmOpenDataEntityResolver({
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      fetch: async () => new Response(new TextEncoder().encode(csv), {status: 200}),
    });
    const result = await resolveOfficialEntity({
      jurisdiction: "BR", subject: {legalName: "Camil Alimentos"}, resolvers: [resolver],
    });
    expect(result.status).toBe("resolved");
    expect(result.selected).toMatchObject({officialIdentifier: "24228", legalName: "CAMIL ALIMENTOS S.A.", sector: "Alimentos"});
    expect(JSON.stringify(result)).not.toContain("example.com");
  });

  it("keeps resolving issuers when another CVM registry row contains a literal opening quote", async () => {
    const csv = [
      "CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;CD_CVM;SETOR_ATIV;SIT;SIT_EMISSOR",
      '00.000.000/0001-00;COMPANHIA COM " DESCRICAO;OUTRA;99999;Outros;ATIVO;NORMAL',
      "64.904.295/0001-03;CAMIL ALIMENTOS S.A.;CAMIL;24228;Alimentos;ATIVO;NORMAL",
    ].join("\n");
    const resolver = createCvmOpenDataEntityResolver({
      fetch: async () => new Response(new TextEncoder().encode(csv), {status: 200}),
    });
    const result = await resolveOfficialEntity({
      jurisdiction: "BR", subject: {legalName: "Camil Alimentos"}, resolvers: [resolver],
    });
    expect(result).toMatchObject({
      status: "resolved",
      selected: {officialIdentifier: "24228", legalName: "CAMIL ALIMENTOS S.A."},
    });
  });

  it("resolves a US registrant and preserves the zero-padded CIK", async () => {
    const resolver = createSecEdgarEntityResolver({
      userAgent: "Offroad Capital research@offroad.capital",
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      fetch: async (_url, init) => {
        expect(new Headers(init?.headers).get("User-Agent")).toContain("Offroad Capital");
        return new Response(JSON.stringify({
          "0": {cik_str: 320193, ticker: "AAPL", title: "Apple Inc."},
          "1": {cik_str: 789019, ticker: "MSFT", title: "Microsoft Corp"},
        }), {status: 200});
      },
    });
    const result = await resolveOfficialEntity({
      jurisdiction: "US", subject: {legalName: "Apple"}, resolvers: [resolver],
    });
    expect(result).toMatchObject({status: "resolved", selected: {officialIdentifier: "CIK:0000320193", ticker: "AAPL"}});
  });

  it("keeps close candidates ambiguous instead of silently selecting a legal entity", async () => {
    const resolver = createCvmOpenDataEntityResolver({
      fetch: async () => new Response(new TextEncoder().encode([
        "CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;CD_CVM;SETOR_ATIV;SIT;SIT_EMISSOR",
        "1;FAROL ENERGIA S.A.;FAROL ENERGIA;100;Energia;ATIVO;NORMAL",
        "2;FAROL ENERGIA HOLDING S.A.;FAROL ENERGIA;101;Energia;ATIVO;NORMAL",
      ].join("\n")), {status: 200}),
    });
    const result = await resolveOfficialEntity({
      jurisdiction: "BR", subject: {legalName: "Farol Energia"}, resolvers: [resolver],
    });
    expect(result.status).toBe("ambiguous");
    expect(result.selected).toBeNull();
    expect(result.candidates).toHaveLength(2);
  });
});
