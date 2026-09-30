import {deliverableFormatBlockCopy} from "@offroad/case-export/deliverable-formats";
import {z} from "zod";

import {documentWorkProductLabels} from "@/lib/advisor/document-work-product-labels";
import {documentWorkProductDocument} from "@/lib/advisor/document-work-product-material";
import {loadDocumentWorkProduct} from "@/lib/advisor/document-work-product-reader";
import {documentaryReadingDeliverableContext, documentaryReadingDeliverableTypes} from "@/lib/advisor/documentary-reading-formats";
import {
  artifactDownloadCopy,
  artifactNotFound,
  artifactUnavailable,
  legacyRowId,
  refusalText,
  renderedRevisionStillAuthorized,
  requestedRevision,
  resolveRouteRevision,
  revisionRendererAllowed,
  templateForRevision,
} from "@/lib/artifacts/artifact-route";
import {artifactResponseHeaders, revisionIssuedOn, verifyRenderedBytes} from "@/lib/artifacts/authorized-artifact-reader";
import {renderArtifactRevision} from "@/lib/artifacts/render-artifact-revision";
import {resourceStillReadable} from "@/lib/auth/resource-download";
import {requireWorkspace} from "@/lib/auth/workspace";

const media = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pdf: "application/pdf",
} as const;

/**
 * The documentary reading as an editable Word file or a final PDF, for one exact artifact revision
 * of kind `work_product` and subject `case-snapshot:<session>` (`?revision=`, or the head), read
 * through the authorized reader. The revision must be the version of the reading that is still
 * current and authorized; its publication date and pinned identity are the file's, whatever day it
 * is downloaded.
 */
export async function GET(request:Request,{params}:{params:Promise<{locale:string;projectId:string;fingerprint:string;format:string}>}) {
  const {locale,projectId,fingerprint,format}=await params;
  // Only the two files this route can write are read at all; the delivery policy, applied once by the
  // serializer, still decides which of them a documentary reading may produce.
  if(!["pt-BR","en-US"].includes(locale)||!z.uuid().safeParse(projectId).success||!/^[a-f0-9]{64}$/.test(fingerprint)||!Object.hasOwn(media,format))return new Response(null,{status:404});
  const revisionParameter=requestedRevision(request);
  if(!revisionParameter.ok)return artifactNotFound();
  const {supabase,organization}=await requireWorkspace(locale);
  if (!await resourceStillReadable(supabase,organization.id,projectId,"project")) return artifactNotFound();
  const result=await loadDocumentWorkProduct(supabase,organization.id,projectId);
  if(!result||result.product.fingerprint!==fingerprint)return new Response(null,{status:404});
  const lang=locale==="en-US"?"en":"pt";
  const copy=artifactDownloadCopy(lang);
  const resolved=await resolveRouteRevision(supabase,{workId:projectId,kind:"work_product",subject:`case-snapshot:${result.sessionId}`},revisionParameter.revisionId);
  if(!resolved.ok){
    if(resolved.outcome==="refused")return artifactUnavailable(refusalText(copy,resolved.refusal));
    return artifactNotFound();
  }
  const {revision,read}=resolved;
  if(!revisionRendererAllowed(revision,{families:["material"]}))return artifactUnavailable(copy.rendererUnavailable);
  // The revision must be the version of this reading: the case manifest it was published with, or
  // the reading's own fingerprint in the traces of a revision written through the command.
  if(legacyRowId(revision,"case_artifact_manifests")!==result.manifestId&&!revision.manifest.traces.includes(`document-work-product:${result.product.fingerprint}`)){
    return resolved.exact?artifactUnavailable(copy.revisionReplaced):new Response(null,{status:404});
  }
  const labels=await documentWorkProductLabels(result.product.locale);
  // A revision that pins no identity keeps the one selected for this project, as the surface shows it.
  const template=await templateForRevision(supabase,projectId,revision,"project");
  if(!template.ok)return artifactUnavailable(copy.templateUnavailable);
  const document=documentWorkProductDocument(result.product,labels);
  const rendered=await renderArtifactRevision({
    revision:{issuedOn:revisionIssuedOn(revision,result.publishedAt),...(template.template?{template:template.template}:{})},
    format,
    lang:document.lang,
    material:()=>document.material,
    meta:{referenceTargets:document.referenceTargets},
    policy:{types:documentaryReadingDeliverableTypes,context:documentaryReadingDeliverableContext()},
  });
  if(!rendered.ok)return rendered.block==="format_not_in_policy"?new Response(null,{status:404}):artifactUnavailable(deliverableFormatBlockCopy[rendered.block][lang]);
  const verification=verifyRenderedBytes(revision,rendered.bytes,{format:rendered.format,selectors:{locale:document.lang}});
  if(verification.status==="mismatch")return artifactUnavailable(copy.bytesMismatch);
  if (!await resourceStillReadable(supabase,organization.id,projectId,"project")) return artifactNotFound();
  if (!await renderedRevisionStillAuthorized(supabase, read)) return artifactUnavailable(copy.sourceRestricted);
  return new Response(new Uint8Array(rendered.bytes),{headers:{
    "content-type":media[format as keyof typeof media],
    "content-disposition":`attachment; filename="offroad-${result.product.job}-${fingerprint.slice(0,12)}.${format}"`,
    "cache-control":"private, no-store", "x-content-type-options":"nosniff",
    "x-work-product-fingerprint":fingerprint,
    ...artifactResponseHeaders(read,verification),
  }});
}
