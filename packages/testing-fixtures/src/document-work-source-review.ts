/** Synthetic authored controls for a probabilistic source reviewer, not financial certification. */
import {createHash} from "node:crypto";
const sha=(text:string)=>createHash("sha256").update(text).digest("hex");
const passages=[
  {id:"alpha",text:"Proposal Alpha requires quarterly financial reporting."},
  {id:"beta",text:"Proposal Beta requires monthly financial reporting."},
  {id:"protection",text:"No leverage covenant or amortization schedule has been provided. No information about guarantees has been supplied."},
].map(source=>({...source,documentId:source.id,documentName:`Synthetic ${source.id}.txt`,version:"1",hash:sha(source.text),anchor:"paragraph 1"}));
const objective="Compare the documented reporting terms and identify missing protection information.";
const input={job:"comparison" as const,locale:"en-US" as const,approvedRequest:{text:objective,fingerprint:sha(objective)},passages,coverage:{documentsConsidered:3,omittedPassages:0,limitations:["Synthetic authored source-review controls only."]}};
function narrative(text:string,question:string) {
  return {sections:(["terms","differences","clarifications"] as const).map((key,index)=>({key,title:key,observations:[{text:passages[index]!.text,citations:[{passageId:passages[index]!.id,quote:passages[index]!.text}]}]})),hypotheses:[{text,question,basisPassageIds:passages.map(source=>source.id)}],gaps:[]};
}
export const originalDocumentWorkSourceReviewCases=[
  {id:"source-review-inverted-frequency",input,narrative:narrative("Alpha reports more frequently than Beta, which may improve monitoring.","How does Alpha's more frequent reporting affect monitoring?"),expectedIssueFieldId:"hypotheses.0.text"},
  {id:"source-review-unknown-as-absent",input,narrative:narrative("The agreement has no leverage covenant, which may reduce protection.","What offsets the absence of a leverage covenant?"),expectedIssueFieldId:"hypotheses.0.text"},
  {id:"source-review-unsupported-guarantee",input,narrative:narrative("A parent guarantee protects the transaction, which may support recovery.","What are the terms of the parent guarantee?"),expectedIssueFieldId:"hypotheses.0.text"},
  {id:"source-review-supported-conditional",input,narrative:narrative("If Alpha's less frequent reporting reduces visibility between reports, supplementary information could help monitoring.","Would supplementary information help between Alpha's quarterly reports compared with Beta's monthly reports?"),expectedIssueFieldId:null},
  {id:"source-review-honest-unknown",input,narrative:narrative("If the agreement includes a leverage covenant, its wording could clarify the monitoring requirements.","Can you provide the leverage covenant terms or confirm whether the agreement includes one?"),expectedIssueFieldId:null},
];

// Preserve the original controls verbatim and enrich the same five provider calls.
// Mixed-language fields deliberately test source review, not translation quality.
const additionalSources = [
  {id:"inspection",text:"Site A requires monthly inspections. Site B requires quarterly inspections."},
  {id:"insurance",text:"Não foram fornecidas informações sobre seguro do projeto."},
  {id:"terminal",text:"The terminal earns fees based on handled volume. No minimum revenue commitment is described."},
].map(source=>({...source,documentId:source.id,documentName:`Synthetic ${source.id}.txt`,version:"1",hash:sha(source.text),anchor:"paragraph 1"}));
const extensions = [
  {hypotheses:[
    {text:"Site A is inspected less frequently than Site B.",question:"How does Site A's lower inspection frequency affect oversight?",basisPassageIds:["inspection"]},
    {text:"Se houver seguro contratado, conhecer a apólice pode esclarecer seu alcance.",question:"Existe seguro contratado e, se existir, a apólice pode ser compartilhada?",basisPassageIds:["insurance"]},
  ],issues:["hypotheses.1.text","hypotheses.1.question"],clean:["hypotheses.2.text","hypotheses.2.question"]},
  {hypotheses:[
    {text:"O projeto não possui seguro.",question:"Como será compensada a ausência de seguro?",basisPassageIds:["insurance"]},
    {text:"If the project has no insurance, that absence would need confirmation before evaluating its implications.",question:"Can you provide the policy or confirm whether insurance exists?",basisPassageIds:["insurance"]},
  ],issues:["hypotheses.1.text","hypotheses.1.question"],clean:["hypotheses.2.text","hypotheses.2.question"]},
  {hypotheses:[
    {text:"If cargo volumes fluctuate, the terminal's guaranteed revenue floor protects receipts.",question:"What is the amount of the guaranteed revenue floor?",basisPassageIds:["terminal"]},
    {text:"A recuperação depende exclusivamente do seguro contratado.",question:"Qual seguradora garante a recuperação?",basisPassageIds:["insurance"]},
  ],issues:["hypotheses.1.text","hypotheses.1.question","hypotheses.2.text","hypotheses.2.question"],clean:[]},
  {hypotheses:[
    {text:"Se não houver seguro contratado, é necessário confirmar essa condição antes de discutir suas consequências.",question:"O seguro existe? Se não existir, essa ausência pode ser confirmada?",basisPassageIds:["insurance"]},
    {text:"If a minimum revenue commitment exists outside the supplied description, its wording could clarify the terminal's documented arrangements.",question:"Is there a minimum revenue commitment, and can its terms be supplied if so?",basisPassageIds:["terminal"]},
  ],issues:[],clean:["hypotheses.1.text","hypotheses.1.question","hypotheses.2.text","hypotheses.2.question"]},
  {hypotheses:[
    {text:"Se a apólice existir em outro documento, sua apresentação pode esclarecer a cobertura contratada.",question:"Pode fornecer a apólice ou confirmar se existe seguro?",basisPassageIds:["insurance"]},
    {text:"If inspection records are available, reviewing them could clarify which inspections have occurred.",question:"Can you provide the inspection records or confirm whether records are available?",basisPassageIds:["inspection"]},
  ],issues:[],clean:["hypotheses.1.text","hypotheses.1.question","hypotheses.2.text","hypotheses.2.question"]},
];
const extendedDocumentWorkSourceReviewCases=originalDocumentWorkSourceReviewCases.map((sample,index)=>{
  const extension=extensions[index]!;
  return {...sample,scope:"mixed_locale_review_controls" as const,
    input:{...sample.input,passages:[...sample.input.passages,...additionalSources],coverage:{...sample.input.coverage,documentsConsidered:sample.input.passages.length+additionalSources.length,limitations:[...sample.input.coverage.limitations,"Mixed-locale authored review controls; not a translation evaluation."]}},
    narrative:{...sample.narrative,hypotheses:[...sample.narrative.hypotheses,...extension.hypotheses]},
    expectedIssueFieldIds:[...(sample.expectedIssueFieldId?[sample.expectedIssueFieldId]:[]),...extension.issues],
    expectedCleanFieldIds:extension.clean,
  };
});

// Identity controls distinguish an unsupported attribution from an explicit common issuer.
const identitySource = {id:"issuer",text:"Offer Gamma and revised offer Delta are issued by Meridian Bank."};
const identityPassage = {...identitySource,documentId:identitySource.id,documentName:"Synthetic issuer.txt",version:"1",hash:sha(identitySource.text),anchor:"paragraph 1"};
const documentedIdentityNarrative = narrative(
  "If Gamma and Delta remain under consideration, both offers identify Meridian Bank as their issuer.",
  "Are Gamma and Delta alternative versions of the same proposed facility?",
);
documentedIdentityNarrative.hypotheses[0]!.basisPassageIds=["issuer"];
const diligenceSource={id:"diligence",text:"Financial statements are still required for diligence. No leverage covenant has been provided. No information about a parent guarantee or a delivery commitment has been supplied."};
const diligencePassage={...diligenceSource,documentId:diligenceSource.id,documentName:"Synthetic diligence.txt",version:"1",hash:sha(diligenceSource.text),anchor:"paragraph 1"};
const diligenceNarrative={...narrative("Management has committed to supply the statements.","When will the committed delivery occur?"),hypotheses:[
  {text:"Management has committed to supply the statements.",question:"When will the committed delivery occur?",basisPassageIds:["diligence"]},
  {text:"A parent guarantee is available for this transaction.",question:"When will the parent guarantee be released?",basisPassageIds:["diligence"]},
],gaps:[
  {text:"Financial statements are required for diligence.",question:"When will the borrower's financial statements be made available for review?"},
  {text:"It is not stated whether a leverage covenant exists, only that one has not been provided.",question:"If the agreement has no leverage covenant, what other protections apply to monitor borrower indebtedness?"},
]};
export const documentWorkSourceReviewCases=[...extendedDocumentWorkSourceReviewCases,
  {id:"source-review-unestablished-counterparties",scope:"mixed_locale_review_controls" as const,input,
    narrative:narrative("If reporting frequency differs, this may reflect different monitoring expectations by each counterparty.","Are the proposals from the same issuer or different issuers?"),
    expectedIssueFieldId:"hypotheses.0.text",expectedIssueFieldIds:["hypotheses.0.text"],expectedCleanFieldIds:["hypotheses.0.question"]},
  {id:"source-review-documented-common-issuer",scope:"mixed_locale_review_controls" as const,
    input:{...input,passages:[...input.passages,identityPassage],coverage:{...input.coverage,documentsConsidered:4}},
    narrative:documentedIdentityNarrative,expectedIssueFieldId:null,expectedIssueFieldIds:[],expectedCleanFieldIds:["hypotheses.0.text","hypotheses.0.question"]},
  {id:"source-review-diligence-request-versus-commitment",scope:"mixed_locale_review_controls" as const,
    input:{...input,passages:[...input.passages,diligencePassage],coverage:{...input.coverage,documentsConsidered:4}},
    narrative:diligenceNarrative,expectedIssueFieldId:"hypotheses.0.text",
    expectedIssueFieldIds:["hypotheses.0.text","hypotheses.0.question","hypotheses.1.text","hypotheses.1.question"],
    expectedCleanFieldIds:["gaps.0.text","gaps.0.question","gaps.1.text","gaps.1.question"]},
];
