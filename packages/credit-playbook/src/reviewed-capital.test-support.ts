import {resolve} from "node:path";
import {compileMethodDocument, loadReviewRecords, type ReviewLookup} from "./procedure-markdown";
const reviews=loadReviewRecords(resolve(import.meta.dirname,"../knowledge/reviews"));
/** Tests read the recorded reviewer evidence; no fabricated passing review. */
export const compileReviewedCapital = (text:string,path:string,lookup:ReviewLookup=(id)=>reviews.get(id)??null) => compileMethodDocument(text,path,lookup);
