import {createTranslator} from "next-intl";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";
import type {BalanceSourceAssessment} from "@offroad/receivables-analysis";
import pt from "../../../messages/pt-BR.json";
import en from "../../../messages/en-US.json";
import {BalanceSourceProposals} from "./balance-source-proposals";
import {ReceivablesProjectSupportPeriods} from "./receivables-project-support-periods";
vi.mock("next-intl/server", () => ({getTranslations: async ({locale,namespace}: {locale: string;namespace: "BalanceSourceProposals" | "ReceivablesSupportPeriods"}) => createTranslator({locale,messages:locale==="en-US"?en:pt,namespace,onError(error){throw error;}})}));
const assessment: BalanceSourceAssessment = {schemaVersion:"balance-source-proposals.v1",issues:[],reportingDate:"2026-08-31",proposals:[{id:"synthetic-proposal",sourceId:"synthetic-source",sourceLabel:"Synthetic balances.xlsx",sourceHash:"a".repeat(64),documentVersion:2,containerId:"sBalances",sheet:"Balances",reviewState:"proposed",calculationUse:"not_permitted",columns:[{role:"closing_balance",header:{id:"sBalances!D3",text:"Saldo final"}}],context:[{kind:"issued_at",anchor:{id:"sBalances!A1",text:"Emitido 2026-09-05"}}],rows:[{id:"row4",cells:[{id:"D4",text:"SECRET-ROW-VALUE-123"}]}],issues:["review_required","economic_date_not_identified"]}]};
describe("balance source observations",()=>{
 it.each(["pt-BR","en-US"])("renders anchored declarations without row values or calculation authority in %s",async(locale)=>{
  const copy=(locale==="en-US"?en:pt).BalanceSourceProposals;
  const html=renderToStaticMarkup(await BalanceSourceProposals({assessment,locale}));
  for(const text of [copy.title,copy.boundary,copy.pending,copy.kind.issued_at,copy.issue.economic_date_not_identified,"Synthetic balances.xlsx","sBalances!D3","Emitido 2026-09-05","2026-08-31"])expect(html).toContain(text);
  expect(html).not.toContain("SECRET-ROW-VALUE");expect(html).not.toContain("<button");expect(html).toContain("<details>");expect(html).not.toContain('"calculationUse"');
 });
 it("shows current observations through the real project wrapper and suppresses stale observations",async()=>{
  const understanding={receivablesVertical:{balanceSourceAssessment:assessment}};
  expect(renderToStaticMarkup(await ReceivablesProjectSupportPeriods({understanding,locale:"en-US",current:true}))).toContain('data-testid="balance-source-proposals"');
  expect(renderToStaticMarkup(await ReceivablesProjectSupportPeriods({understanding,locale:"en-US",current:false}))).not.toContain("Synthetic balances.xlsx");
 });
 it("fails closed on an invalid proposal and leaves legacy reports unchanged",async()=>{
  const understanding={receivablesVertical:{pipeline:{},balanceSourceAssessment:{...assessment,proposals:[{...assessment.proposals[0],calculationUse:"permitted"}]}}};
  expect(renderToStaticMarkup(await ReceivablesProjectSupportPeriods({understanding,locale:"en-US",current:true}))).not.toContain('data-testid="balance-source-proposals"');
  expect(await BalanceSourceProposals({assessment:{...assessment,proposals:[]},locale:"en-US"})).toBeNull();
 });
});

it.each(["pt-BR","en-US"])("shows assessment limits even without proposals in %s",async(locale)=>{const copy=(locale==="en-US"?en:pt).BalanceSourceProposals;const html=renderToStaticMarkup(await BalanceSourceProposals({locale,assessment:{...assessment,proposals:[],issues:["assessment_limit_reached"]}}));expect(html).toContain(copy.issue.assessment_limit_reached);expect(html).toContain('data-testid="balance-source-proposals"');});
it("shows partial text and source limits",async()=>{const proposal=assessment.proposals[0]!;const html=renderToStaticMarkup(await BalanceSourceProposals({locale:"en-US",assessment:{...assessment,proposals:[{...proposal,columns:[{...proposal.columns[0]!,header:{...proposal.columns[0]!.header,truncated:true}}],issues:["source_context_truncated","source_cells_truncated","source_text_truncated"]}]}}));expect(html).toContain(en.BalanceSourceProposals.truncated);for(const key of ["source_context_truncated","source_cells_truncated","source_text_truncated"] as const)expect(html).toContain(en.BalanceSourceProposals.issue[key]);});
