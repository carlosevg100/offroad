import {describe, expect, it} from "vitest";

import {addMonths, conditionsPrecedent, disbursementReadiness, paymentSchedule, trackConditions} from "./index";

describe("paymentSchedule", () => {
  const base = {principal: "42300000", disbursementDate: "2026-10-31", tenorMonths: 48, graceMonths: 12, frequency: "monthly" as const, basis: {cdiPct: "10.50"}};

  it("SAC: equal principal after grace, interest on the falling balance, closes at zero", () => {
    const schedule = paymentSchedule({...base, amortization: "sac", pricing: {type: "cdi_plus", spreadPct: "4.50"}});
    expect(schedule.annualRatePct).toBe("15");
    expect(schedule.lines).toHaveLength(48);
    expect(schedule.lines[0]!.inGrace).toBe(true);
    expect(schedule.lines[0]!.principal).toBe("0.00");
    expect(schedule.lines[12]!.principal).toBe("1175000.00");
    expect(schedule.lines[47]!.closingBalance).toBe("0.00");
    expect(schedule.lines[0]!.date).toBe("2026-11-30");
    expect(Number(schedule.totals.principal)).toBe(42300000);
    expect(Number(schedule.firstYearService)).toBeGreaterThan(0);
    expect(schedule.notes[0]!.pt).toContain("CDI de 10.50%");
  });

  it("Price: level payment over the amortising periods", () => {
    const schedule = paymentSchedule({...base, amortization: "price", pricing: {type: "fixed", ratePct: "12.00"}});
    const payments = new Set(schedule.lines.slice(12, 47).map((line) => line.payment));
    expect(payments.size).toBe(1);
    expect(schedule.lines[47]!.closingBalance).toBe("0.00");
    expect(schedule.notes).toHaveLength(0);
  });

  it("bullet with capitalised grace pays everything at the end", () => {
    const schedule = paymentSchedule({...base, graceMonths: 0, amortization: "bullet", frequency: "semiannual", tenorMonths: 36, pricing: {type: "ipca_plus", spreadPct: "7.00"}, basis: {cdiPct: "10.50", ipcaPct: "4.00"}});
    expect(schedule.lines).toHaveLength(6);
    expect(schedule.lines[5]!.principal).toBe("42300000.00");
    expect(schedule.annualRatePct).toBe("11.28");
  });

  it("refuses a tenor that does not fit the frequency", () => {
    expect(() => paymentSchedule({...base, tenorMonths: 50, frequency: "semiannual", amortization: "sac", pricing: {type: "fixed", ratePct: "12"}})).toThrow(RangeError);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });
});

describe("conditions precedent to disbursement", () => {
  const conditions = conditionsPrecedent({
    security: [{pt: "Cessão fiduciária de recebíveis (130%)", en: "Fiduciary assignment of receivables (130%)"}, {pt: "Alienação fiduciária do CD de Jacareí", en: "Fiduciary lien on the Jacareí DC"}],
    fromTermSheet: [{pt: "Conta vinculada aberta", en: "Escrow account opened", owner: "investor"}],
  });

  it("assembles the playbook's closing tier, the security and the term sheet", () => {
    expect(conditions.filter((c) => c.source === "playbook")).toHaveLength(5);
    expect(conditions.find((c) => c.id === "closing_legal_opinion")?.owner).toBe("counsel");
    expect(conditions.filter((c) => c.source === "security").map((c) => c.labels.en)).toEqual(["Constitution and registration: Fiduciary assignment of receivables (130%)", "Constitution and registration: Fiduciary lien on the Jacareí DC"]);
    expect(conditions.find((c) => c.source === "term_sheet")?.owner).toBe("investor");
  });

  it("needs evidence to satisfy and a reason to waive; disbursement waits for every blocking CP", () => {
    const at = (n: number) => `2026-11-${String(n).padStart(2, "0")}T10:00:00Z`;
    const events = [
      {conditionId: "closing_corporate_approvals", at: at(1), actor: "cfo", status: "satisfied" as const},
      {conditionId: "closing_corporate_approvals", at: at(2), actor: "cfo", status: "satisfied" as const, evidence: "Ata AGE 02/11/2026"},
      {conditionId: "closing_certificates", at: at(3), actor: "counsel", status: "waived" as const},
      {conditionId: "closing_certificates", at: at(4), actor: "counsel", status: "waived" as const, reason: "certidão positiva com efeito de negativa aceita pelo investidor"},
    ];
    const tracks = trackConditions(conditions, events);
    const approvals = tracks.find((t) => t.id === "closing_corporate_approvals")!;
    expect(approvals.status).toBe("satisfied");
    expect(approvals.refused).toHaveLength(1);
    expect(tracks.find((t) => t.id === "closing_certificates")!.status).toBe("waived");
    const readiness = disbursementReadiness(tracks);
    expect(readiness.ready).toBe(false);
    expect(readiness.blockingOpen.map((t) => t.id)).toContain("closing_security_registration");
    expect(readiness.summary.en).toContain("blocking condition(s) open");

    const all = trackConditions(conditions, [...events, ...conditions.filter((c) => c.blocking).map((c) => ({conditionId: c.id, at: at(10), actor: "desk", status: "satisfied" as const, evidence: "ok"}))]);
    expect(disbursementReadiness(all).ready).toBe(true);
  });
});
