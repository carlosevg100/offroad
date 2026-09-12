import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {createElement} from "react";
import {websiteAdvisorFixture} from "@offroad/testing-fixtures";
import {websiteAdvisorExample,boardScenarioKeys} from "./website-advisor-example";
import {websiteFinancialBaseline} from "./website-example";
import {CapitalBoard,CapitalHistory,CapitalReceivables} from "@/components/public-capital-case";
import pt from "../../messages/pt-BR.json";
import en from "../../messages/en-US.json";

describe("ACME public case financial consistency",()=>{
  it("sizes gross receivables advances without presenting a face value as available funding",()=>{
    const r=websiteAdvisorExample("en-US").receivables;
    expect(r).toMatchObject({face:"30",debtors:"400",days:"45",monthly:"20",eligible:"24",full:"24",restricted:"19.2"});
    expect(websiteAdvisorFixture.synthetic).toBe(true);
  });
  it("reconciles every alternative across the full three-year horizon",()=>{
    const b=websiteAdvisorExample("en-US").board;
    expect(b.scenarios.base.values).toEqual([85,52,-223,-133]);
    expect(b.scenarios.plant.values).toEqual([85,106.2,-62.8,-14.8]);
    expect(b.scenarios.integrated.values).toEqual([85,145.9,77.9,114.9]);
    expect(b.scenarios.defer.values).toEqual([85,112,85,-20]);
    expect(boardScenarioKeys.filter(key=>b.scenarios[key].allYearsMeetFloor)).toEqual(["integrated"]);
    expect(b.scenarios.integrated.totalDraws).toBe("285");
    expect(b.scenarios.plant.rows[1].leverage).toBeNull();
    expect(b.scenarios.integrated.rows[0].uses.find(line=>line.id==="dividend")?.value).toBe("0");
    expect(b.scenarios.base.rows[1].uses.find(line=>line.id==="dividend")?.value).toBe("0");
  });
  it("keeps EBITDA headroom distinct from debt capacity and uses the same ACME base in all examples",()=>{
    const b=websiteAdvisorExample("en-US").board;
    expect(b.history[2]).toMatchObject({revenue:"1,510",ebitda:"150",netDebt:"420",leverage:"2.80"});
    expect(b.margin).toBe("9.9%");expect(b.ebitdaHeadroom).toBe("20.8");expect(b.covenantLimit).toBe("3.25");
    expect(b.leverage).toBe("2.43");expect(b.downsideLeverage).toBe("2.86");
    expect(websiteFinancialBaseline("en-US").adjusted).toBe("150.0");
  });
  it.each(["pt-BR","en-US"] as const)("exposes the numbers, decisions and sources without unresolved copy in %s",locale=>{
    const copy=(locale==="pt-BR"?pt:en).Website.capitalCase;const analysis=websiteAdvisorExample(locale);
    for(const initialScenario of boardScenarioKeys){const html=renderToStaticMarkup(createElement(CapitalBoard,{copy,analysis,initialScenario}));expect(html).toContain(analysis.board.scenarios[initialScenario].cash2027);expect(html).toContain(copy.board.sourcesTitle);expect(html).toContain(copy.board.scheduledMaturity);expect(html).not.toMatch(/\{\w+\}|undefined|NaN/);}
    const history=renderToStaticMarkup(createElement(CapitalHistory,{copy,analysis}));expect(history).toContain(analysis.board.ebitdaHeadroom);
    const receivables=renderToStaticMarkup(createElement(CapitalReceivables,{copy,analysis}));expect(receivables).toContain(copy.receivables.fidc.how);expect(receivables).toContain(copy.receivables.next);expect(receivables).not.toContain("carteira multicedente");
  });
});
