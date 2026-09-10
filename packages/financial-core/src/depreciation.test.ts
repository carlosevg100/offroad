import {describe, expect, it} from "vitest";
import Decimal from "decimal.js";
import {calculateAnnualCapexDepreciation} from "./depreciation";

describe("annual capex depreciation by vintage",()=>{
  it.each([
    ["next_period",["0","50","50","0","0"]],
    ["half_year",["25","50","25","0","0"]],
  ] as const)("exhausts cost exactly under %s and stops after useful life",(convention,expected)=>{
    const amountsByYear=["100","0","0","0","0"];
    const rows=amountsByYear.map((_,yearIndex)=>calculateAnnualCapexDepreciation({amountsByYear,usefulLifeYears:2,convention,yearIndex}));
    expect(rows.map(row=>row.value)).toEqual(expected);
    expect(rows.reduce((total,row)=>total.plus(row.value),new Decimal(0)).toFixed()).toBe("100");
    expect(rows[2]!.vintages[0]).toMatchObject({yearIndex:0,amount:"100",factor:convention==="half_year"?"0.5":"1"});
  });
  it("keeps overlapping vintages separate",()=>{
    const amountsByYear=["100","200","0","0","0"];
    expect(amountsByYear.map((_,yearIndex)=>calculateAnnualCapexDepreciation({amountsByYear,usefulLifeYears:1,convention:"half_year",yearIndex}).value)).toEqual(["50","150","100","0","0"]);
  });
  it.each(["-1","NaN","Infinity"])("rejects invalid investment %s",amount=>{
    expect(()=>calculateAnnualCapexDepreciation({amountsByYear:[amount],usefulLifeYears:1,convention:"half_year",yearIndex:0})).toThrow();
  });
  it.each([0,-1,1.5,Infinity])("rejects invalid life %s",usefulLifeYears=>{
    expect(()=>calculateAnnualCapexDepreciation({amountsByYear:["10"],usefulLifeYears,convention:"half_year",yearIndex:0})).toThrow();
  });
});
