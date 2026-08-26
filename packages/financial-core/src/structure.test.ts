import {describe, expect, it} from "vitest";

import {buildDebtServiceSchedule, calculateCoverageSeries, calculateCovenantHeadroom, maturityConcentration, periodicRate} from "./structure";

describe("M5 deterministic structuring math", () => {
  it("builds SAC with paid grace and closes exactly at zero", () => {
    const schedule=buildDebtServiceSchedule({amount:"120",annualRate:"0.12",rateConvention:"nominal_annual",termMonths:14,graceMonths:2,graceInterest:"paid",format:"sac"});
    expect(schedule.rows[0]).toMatchObject({principal:"0",interestPaid:"1.2",closingBalance:"120"});
    expect(schedule.rows[2]).toMatchObject({principal:"10",closingBalance:"110"});
    expect(schedule.rows.at(-1)?.closingBalance).toBe("0");
    expect(schedule.weightedAverageLifeMonths).toBe("8.5");
  });

  it("capitalizes grace visibly and repays the resulting balance", () => {
    const schedule=buildDebtServiceSchedule({amount:"100",annualRate:"0.12",rateConvention:"nominal_annual",termMonths:12,graceMonths:2,graceInterest:"capitalized",format:"bullet"});
    expect(schedule.rows[0]).toMatchObject({interestPaid:"0",interestCapitalized:"1",closingBalance:"101"});
    expect(schedule.rows[1]!.closingBalance).toBe("102.01");
    expect(schedule.rows.at(-1)?.principal).toBe("102.01");
  });

  it("supports Price, balloon and effective annual conversion without residual balance", () => {
    expect(periodicRate({annualRate:"0.12682503",periodsPerYear:12,convention:"effective_annual"})).toBe("0.01");
    for (const format of ["price","balloon"] as const) {
      const schedule=buildDebtServiceSchedule({amount:"1000",annualRate:"0.12",rateConvention:"nominal_annual",termMonths:24,graceMonths:0,graceInterest:"paid",format,...(format==="balloon"?{balloonPercent:"0.4"}: {})});
      expect(schedule.rows.at(-1)?.closingBalance).toBe("0");
    }
  });

  it("finds the critical DSCR period and covenant headroom", () => {
    const schedule=buildDebtServiceSchedule({amount:"120",annualRate:"0",rateConvention:"nominal_annual",termMonths:12,graceMonths:0,graceInterest:"paid",format:"sac"});
    const coverage=calculateCoverageSeries({schedule:schedule.rows,scenarios:[{name:"downside",cfadsByPeriod:Object.fromEntries(schedule.rows.map((row)=>[row.period,row.period===5?"11":"15"]))}]});
    expect(coverage[0]).toMatchObject({minimumDscr:"1.1",criticalPeriod:5});
    expect(calculateCovenantHeadroom({actual:"2.8",limit:"3.5",direction:"maximum"})).toMatchObject({absolute:"0.7",percentage:"0.2",passes:true});
  });

  it("consolidates the maturity wall instead of viewing new debt in isolation", () => {
    const result=maturityConcentration({existing:{Y1:"20",Y2:"30"},proposed:{Y2:"30",Y3:"20"}});
    expect(result.total).toBe("100");
    expect(result.rows.find((row)=>row.period==="Y2")).toMatchObject({existing:"30",proposed:"30",consolidated:"60",share:"0.6"});
  });
});
