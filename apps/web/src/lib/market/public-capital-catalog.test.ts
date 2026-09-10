import {describe, expect, it} from "vitest";

import {filterPublicInstitutions, parsePublicCapitalCatalog, publicCapitalCatalog as catalog, researchStructures, screenPublicInstitution} from "./public-capital-catalog";

const byId = (id: string) => catalog.institutions.find(row => row.id === id)!;
describe("public capital research boundary", () => {
  it("loads a sourced, dated sample without promoting any mandate", () => {
    expect(catalog.institutions).toHaveLength(28);
    expect(catalog.coverage.liveMandatesVerified).toBe(0);
    for (const row of catalog.institutions) for (const structure of researchStructures) {
      expect(screenPublicInstitution(row, structure).eligibleForVerifiedMandateMatching).toBe(false);
    }
  });
  it.each(["bocaina", "santander", "abc"])("does not turn project strategy %s into a receivables candidate", id => {
    expect(screenPublicInstitution(byId(id), "receivables")).toMatchObject({status: "strategy_unconfirmed", researchCandidate: false});
    expect(screenPublicInstitution(byId(id), "project_finance")).toMatchObject({status: "strategy_observed", researchCandidate: true});
  });
  it("requires affirmative strategy evidence and retains unknown instead of fabricating rejection", () => {
    expect(screenPublicInstitution({...byId("bocaina"), claims: []}, "project_finance").status).toBe("strategy_unconfirmed");
    expect(screenPublicInstitution(byId("vinci"), "project_finance").status).toBe("strategy_unconfirmed");
    expect(screenPublicInstitution(byId("solis"), "project_finance").status).toBe("strategy_unconfirmed");
    expect(screenPublicInstitution(byId("solis"), "receivables").status).toBe("strategy_observed");
  });
  it.each(["bradesco-bbi", "vert", "oliveira-trust"])("does not treat documented intermediary %s as a risk holder", id => {
    for (const structure of researchStructures) expect(screenPublicInstitution(byId(id), structure)).toMatchObject({status: "intermediary_only", researchCandidate: false});
  });
  it("does not categorically exclude a FIDC manager from corporate financing", () => {
    const row = byId("patria");
    expect(row.vehicles.some(vehicle => vehicle.name.includes("FIDC"))).toBe(true);
    expect(screenPublicInstitution(row, "corporate").status).toBe("strategy_observed");
    expect(screenPublicInstitution(row, "receivables").status).toBe("strategy_observed");
  });
  it("searches vehicles and accent-insensitive names, combines role and strategy", () => {
    expect(filterPublicInstitutions(catalog, {query: "patria"}).map(row => row.id)).toContain("patria");
    expect(filterPublicInstitutions(catalog, {query: "receivables"}).map(row => row.id)).toContain("solis");
    expect(filterPublicInstitutions(catalog, {query: "equipment"}).map(row => row.id)).toContain("dll");
    expect(filterPublicInstitutions(catalog, {query: "KNCR11"}).map(row => row.id)).toEqual(["kinea"]);
    expect(filterPublicInstitutions(catalog, {role: "bank", segment: "receivables"}).every(row => row.roles.includes("bank") && row.segmentIds.includes("receivables"))).toBe(true);
    expect(filterPublicInstitutions(catalog, {query: "nonexistent institution"})).toEqual([]);
  });
  it("rejects broken sources, dangerous URLs, duplicate IDs and false mandate promotion", () => {
    const broken = structuredClone(catalog); broken.institutions[0]!.claims[0]!.sourceIds = ["absent"];
    expect(() => parsePublicCapitalCatalog(broken)).toThrow();
    const unsafe = structuredClone(catalog); unsafe.sources[0]!.url = "javascript:alert(1)";
    expect(() => parsePublicCapitalCatalog(unsafe)).toThrow();
    const duplicate = structuredClone(catalog); duplicate.institutions[1]!.id = duplicate.institutions[0]!.id;
    expect(() => parsePublicCapitalCatalog(duplicate)).toThrow();
    const mandate = {...catalog, institutions: catalog.institutions.map(row => ({...row, eligibleForVerifiedMandateMatching: true}))};
    expect(() => parsePublicCapitalCatalog(mandate)).toThrow();
  });
});
