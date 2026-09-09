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
export const documentWorkSourceReviewCases=[
  {id:"source-review-inverted-frequency",input,narrative:narrative("Alpha reports more frequently than Beta, which may improve monitoring.","How does Alpha's more frequent reporting affect monitoring?"),expectedIssueFieldId:"hypotheses.0.text"},
  {id:"source-review-unknown-as-absent",input,narrative:narrative("The agreement has no leverage covenant, which may reduce protection.","What offsets the absence of a leverage covenant?"),expectedIssueFieldId:"hypotheses.0.text"},
  {id:"source-review-unsupported-guarantee",input,narrative:narrative("A parent guarantee protects the transaction, which may support recovery.","What are the terms of the parent guarantee?"),expectedIssueFieldId:"hypotheses.0.text"},
  {id:"source-review-supported-conditional",input,narrative:narrative("If Alpha's less frequent reporting reduces visibility between reports, supplementary information could help monitoring.","Would supplementary information help between Alpha's quarterly reports compared with Beta's monthly reports?"),expectedIssueFieldId:null},
  {id:"source-review-honest-unknown",input,narrative:narrative("If the agreement includes a leverage covenant, its wording could clarify the monitoring requirements.","Can you provide the leverage covenant terms or confirm whether the agreement includes one?"),expectedIssueFieldId:null},
];
