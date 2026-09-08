import {z} from "zod";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadDocumentWorkProduct} from "@/lib/advisor/document-work-product-reader";
import {documentWorkProductLabels} from "@/lib/advisor/document-work-product-labels";
import {documentWorkProductToDocx} from "@/lib/advisor/document-work-product-material";

export async function GET(_request:Request,{params}:{params:Promise<{locale:string;projectId:string;fingerprint:string}>}) {
  const {locale,projectId,fingerprint}=await params;
  if(!["pt-BR","en-US"].includes(locale)||!z.uuid().safeParse(projectId).success||!/^[a-f0-9]{64}$/.test(fingerprint))return new Response(null,{status:404});
  const {supabase,organization}=await requireWorkspace(locale);
  const result=await loadDocumentWorkProduct(supabase,organization.id,projectId);
  if(!result||result.product.fingerprint!==fingerprint)return new Response(null,{status:404});
  const labels=await documentWorkProductLabels(result.product.locale);
  const bytes=documentWorkProductToDocx({product:result.product,labels,issuedOn:result.publishedAt.slice(0,10)});
  return new Response(new Uint8Array(bytes),{headers:{
    "content-type":"application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "content-disposition":`attachment; filename="offroad-${result.product.job}-${fingerprint.slice(0,12)}.docx"`,
    "cache-control":"private, no-store", "x-content-type-options":"nosniff",
    "x-work-product-fingerprint":fingerprint,
  }});
}
