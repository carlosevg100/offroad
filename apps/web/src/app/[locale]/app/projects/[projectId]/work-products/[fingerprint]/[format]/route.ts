import {deliverableFormatAllowed, deliverableFormatBlockCopy} from "@offroad/case-export/deliverable-formats";
import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadDocumentWorkProduct} from "@/lib/advisor/document-work-product-reader";
import {documentWorkProductLabels} from "@/lib/advisor/document-work-product-labels";
import {documentWorkProductToDocx, documentWorkProductToPdf} from "@/lib/advisor/document-work-product-material";
import {documentaryReadingDeliverableContext, documentaryReadingDeliverableTypes} from "@/lib/advisor/documentary-reading-formats";

const media = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;

export async function GET(_request:Request,{params}:{params:Promise<{locale:string;projectId:string;fingerprint:string;format:string}>}) {
  const {locale,projectId,fingerprint,format}=await params;
  if(!["pt-BR","en-US"].includes(locale)||!z.uuid().safeParse(projectId).success||!/^[a-f0-9]{64}$/.test(fingerprint))return new Response(null,{status:404});
  // The delivery policy, not the route, decides which files a documentary reading may produce.
  const policy=deliverableFormatAllowed(documentaryReadingDeliverableTypes,format,documentaryReadingDeliverableContext());
  if(!policy.allowed)return new Response(policy.block==="format_not_in_policy"?null:deliverableFormatBlockCopy[policy.block][locale==="en-US"?"en":"pt"],{status:policy.block==="format_not_in_policy"?404:409});
  const {supabase,organization}=await requireWorkspace(locale);
  const result=await loadDocumentWorkProduct(supabase,organization.id,projectId);
  if(!result||result.product.fingerprint!==fingerprint)return new Response(null,{status:404});
  const labels=await documentWorkProductLabels(result.product.locale);
  const input={product:result.product,labels,issuedOn:result.publishedAt.slice(0,10)};
  const bytes=format==="pdf"?await documentWorkProductToPdf(input):documentWorkProductToDocx(input);
  return new Response(new Uint8Array(bytes),{headers:{
    "content-type":media[format as keyof typeof media],
    "content-disposition":`attachment; filename="offroad-${result.product.job}-${fingerprint.slice(0,12)}.${format}"`,
    "cache-control":"private, no-store", "x-content-type-options":"nosniff",
    "x-work-product-fingerprint":fingerprint,
  }});
}
