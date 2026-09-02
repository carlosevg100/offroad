import JSZip from "jszip";
import {describe, expect, it} from "vitest";

import {createCvmOpenDataEntityResolver, createSecEdgarEntityResolver} from "./entity-resolvers";
import {createOfficialCompanyResearchProvider} from "./official-company-research";

describe("official company research", () => {
  it("resolves a Brazilian issuer and extracts only the issuer's latest CVM statement rows", async () => {
    const registry = [
      "CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;CD_CVM;SETOR_ATIV;SIT;SIT_EMISSOR",
      "64.904.295/0001-03;CAMIL ALIMENTOS S.A.;CAMIL;24228;Alimentos;ATIVO;NORMAL",
    ].join("\n");
    const zip = new JSZip();
    zip.file("dfp_cia_aberta_BPP_con_2025.csv", [
      "CD_CVM;DT_REFER;VERSAO;DENOM_CIA;GRUPO_DFP;MOEDA;ESCALA_MOEDA;ORDEM_EXERC;DT_FIM_EXERC;CD_CONTA;DS_CONTA;VL_CONTA;ST_CONTA_FIXA",
      "24228;2025-12-31;1;CAMIL ALIMENTOS S.A.;DF Consolidado;REAL;MIL;ULTIMO;2025-12-31;2.01.04;Empréstimos e Financiamentos;1000;S",
      "24228;2025-12-31;2;CAMIL ALIMENTOS S.A.;DF Consolidado;REAL;MIL;ULTIMO;2025-12-31;2.01.04;Empréstimos e Financiamentos;1200;S",
      "24228;2025-12-31;2;CAMIL ALIMENTOS S.A.;DF Consolidado;REAL;MIL;ULTIMO;2025-12-31;2.03;Patrimônio Líquido;5000;S",
      '24228;2025-12-31;2;CAMIL ALIMENTOS S.A.;DF Consolidado;REAL;MIL;ULTIMO;2025-12-31;2.02.01;Dívida com " proteção;300;S',
      "99999;2025-12-31;2;OUTRA S.A.;DF Consolidado;REAL;MIL;ULTIMO;2025-12-31;2.01.04;Empréstimos e Financiamentos;999999;S",
    ].join("\n"));
    const zipBytes = await zip.generateAsync({type: "uint8array"});
    const fetcher: typeof fetch = async (url) => {
      const value = String(url);
      if (value.endsWith("cad_cia_aberta.csv")) return new Response(new TextEncoder().encode(registry), {status: 200});
      if (value.endsWith("dfp_cia_aberta_2025.zip")) {
        return new Response(Uint8Array.from(zipBytes).buffer, {status: 200});
      }
      return new Response("not found", {status: 404});
    };
    const resolver = createCvmOpenDataEntityResolver({fetch: fetcher});
    const provider = createOfficialCompanyResearchProvider({
      jurisdiction: "BR",
      subject: {legalName: "Camil Alimentos", geography: "Brasil"},
      resolvers: [resolver],
      userAgent: "Offroad Capital research@offroad.capital",
      fetch: fetcher,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
      cvmAnnualYears: [2025],
      cvmInterimYears: [],
    });
    const sources = await provider.search({
      id: "a".repeat(64), topic: "identity", query: "Camil resultados financeiros endividamento",
      domainAllowlist: [],
    });
    expect(provider.continueAfterSuccess).toBe(true);
    expect(sources).toHaveLength(2);
    const statements = sources.find((source) => source.title.includes("DFP"));
    expect(statements?.snippet).toContain("value=1200");
    expect(statements?.snippet).toContain("value=5000");
    expect(statements?.snippet).toContain('" prote');
    expect(statements?.snippet).toContain("value=300");
    expect(statements?.snippet).not.toContain("value=1000");
    expect(statements?.snippet).not.toContain("999999");
  });

  it("builds SEC filing and company-fact evidence with exact official URLs", async () => {
    const fetcher: typeof fetch = async (url, init) => {
      expect(new Headers(init?.headers).get("User-Agent")).toContain("Offroad Capital");
      const value = String(url);
      if (value.endsWith("company_tickers.json")) {
        return new Response(JSON.stringify({"0": {cik_str: 320193, ticker: "AAPL", title: "Apple Inc."}}), {status: 200});
      }
      if (value.includes("submissions/CIK0000320193.json")) {
        return new Response(JSON.stringify({
          name: "Apple Inc.", cik: "0000320193", tickers: ["AAPL"], exchanges: ["Nasdaq"],
          sic: "3571", sicDescription: "Electronic Computers",
          filings: {recent: {
            accessionNumber: ["0000320193-26-000001"], filingDate: ["2026-08-01"],
            reportDate: ["2026-06-30"], form: ["10-Q"], primaryDocument: ["aapl-20260630.htm"],
            primaryDocDescription: ["Quarterly report"],
          }},
        }), {status: 200});
      }
      if (value.includes("api/xbrl/companyfacts/CIK0000320193.json")) {
        return new Response(JSON.stringify({
          entityName: "Apple Inc.",
          facts: {"us-gaap": {Assets: {
            label: "Assets", description: "Total assets",
            units: {USD: [{val: 350000000000, accn: "0000320193-26-000001", form: "10-Q", filed: "2026-08-01", end: "2026-06-30"}]},
          }}},
        }), {status: 200});
      }
      return new Response("not found", {status: 404});
    };
    const resolver = createSecEdgarEntityResolver({
      userAgent: "Offroad Capital research@offroad.capital",
      fetch: fetcher,
    });
    const provider = createOfficialCompanyResearchProvider({
      jurisdiction: "US", subject: {legalName: "Apple"}, resolvers: [resolver],
      userAgent: "Offroad Capital research@offroad.capital", fetch: fetcher,
      now: () => new Date("2026-09-01T12:00:00.000Z"),
    });
    const sources = await provider.search({
      id: "b".repeat(64), topic: "identity", query: "Apple financial debt results", domainAllowlist: [],
    });
    expect(sources.map((source) => source.url)).toContain("https://data.sec.gov/submissions/CIK0000320193.json");
    expect(sources.map((source) => source.url)).toContain("https://data.sec.gov/api/xbrl/companyfacts/CIK0000320193.json");
    expect(sources.find((source) => source.url.includes("companyfacts"))?.snippet).toContain("value=350000000000");
    expect(sources.find((source) => source.url.includes("submissions"))?.snippet)
      .toContain("https://www.sec.gov/Archives/edgar/data/320193/000032019326000001/aapl-20260630.htm");
  });

  it("refuses to choose between ambiguous official entities", async () => {
    const resolver = createCvmOpenDataEntityResolver({
      fetch: async () => new Response(new TextEncoder().encode([
        "CNPJ_CIA;DENOM_SOCIAL;DENOM_COMERC;CD_CVM;SETOR_ATIV;SIT;SIT_EMISSOR",
        "1;FAROL ENERGIA S.A.;FAROL ENERGIA;100;Energia;ATIVO;NORMAL",
        "2;FAROL ENERGIA HOLDING S.A.;FAROL ENERGIA;101;Energia;ATIVO;NORMAL",
      ].join("\n")), {status: 200}),
    });
    const provider = createOfficialCompanyResearchProvider({
      jurisdiction: "BR", subject: {legalName: "Farol Energia"}, resolvers: [resolver],
      userAgent: "Offroad Capital research@offroad.capital",
    });
    await expect(provider.search({
      id: "c".repeat(64), topic: "identity", query: "Farol Energia site oficial", domainAllowlist: [],
    })).rejects.toMatchObject({code: "official_entity_ambiguous"});
  });
});
