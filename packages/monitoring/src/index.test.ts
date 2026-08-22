import {describe, expect, it} from "vitest";

import {monitoringMaterial, testCovenants, type AgreedCovenant} from "./index";

const agreed: AgreedCovenant[] = [
  {id: "net_leverage", threshold: "3.0", direction: "max", cureDays: 30, steps: [{from: "2027-01-01", threshold: "2.75"}]},
  {id: "interest_coverage", threshold: "2.0", direction: "min", cureDays: 30},
  {id: "dscr", threshold: "1.2", direction: "min"},
  {id: "minimum_cash", threshold: "5000000"},
  {id: "restricted_payments", cureDays: 15},
  {id: "information"},
];

describe("a new period tests the covenants", () => {
  it("computes each financial covenant on the indenture's definitions with direction-aware headroom", () => {
    const report = testCovenants(agreed, {periodEnd: "2026-09-30", netDebt: "36900000", ebitdaLtm: "13500000", netInterestLtm: "6500000", cash: "5200000", declared: {restricted_payments: {compliant: true}}});
    const byId = new Map(report.tests.map((test) => [test.id, test]));
    expect(byId.get("net_leverage")?.status).toBe("watch");
    expect(byId.get("net_leverage")?.headroom).toBe("0.0889");
    expect(byId.get("interest_coverage")?.headroom).toBe("0.0385");
    expect(byId.get("interest_coverage")?.status).toBe("watch");
    expect(byId.get("dscr")?.status).toBe("not_testable");
    expect(byId.get("dscr")?.missing).toEqual(["cfadsLtm", "debtServiceLtm"]);
    expect(byId.get("minimum_cash")?.status).toBe("watch");
    expect(byId.get("restricted_payments")?.status).toBe("ok");
    expect(byId.get("information")?.status).toBe("not_testable");
    expect(report.worst).toBe("watch");
    expect(report.summary.pt).toBe("2026-09-30: 1 cumpridos, 3 em atenção, 0 violados, 2 não testáveis.");
  });

  it("declares a breach with the cure date and applies a stepped threshold", () => {
    const report = testCovenants(agreed, {periodEnd: "2027-03-31", netDebt: "39000000", ebitdaLtm: "13000000", netInterestLtm: "7000000", declared: {restricted_payments: {compliant: false, note: "dividendo pago acima do permitido"}}});
    const leverage = report.tests.find((test) => test.id === "net_leverage")!;
    expect(leverage.threshold).toBe("2.75");
    expect(leverage.status).toBe("breach");
    expect(leverage.cureBy).toBe("2027-04-30");
    expect(leverage.note.pt).toContain("violado por");
    const rp = report.tests.find((test) => test.id === "restricted_payments")!;
    expect(rp.status).toBe("breach");
    expect(rp.cureBy).toBe("2027-04-15");
    expect(report.worst).toBe("breach");
    expect(report.alerts.map((test) => test.id)).toEqual(["net_leverage", "interest_coverage", "restricted_payments"]);
  });

  it("never assumes a pass when the denominator is not positive", () => {
    const report = testCovenants([{id: "net_leverage", threshold: "3.0"}], {periodEnd: "2026-12-31", netDebt: "10000000", ebitdaLtm: "-500000"});
    expect(report.tests[0]!.status).toBe("not_testable");
    expect(report.tests[0]!.missing).toEqual(["denominator not positive"]);
  });

  it("writes the investor report with the table, the alerts and what is missing", () => {
    const report = testCovenants(agreed, {periodEnd: "2026-09-30", netDebt: "36900000", ebitdaLtm: "13500000", netInterestLtm: "6500000", cash: "5200000"});
    const material = monitoringMaterial(report, {companyName: "Aurora", source: "Balancete set/2026"});
    expect(material.title.pt).toBe("Relatório de covenants: Aurora");
    const table = material.blocks.find((block) => block.type === "table");
    expect(table && table.type === "table" ? table.rows.length : 0).toBe(6);
    expect(material.blocks.some((block) => block.type === "kv")).toBe(true);
    expect(material.blocks.some((block) => block.type === "list")).toBe(true);
  });
});
