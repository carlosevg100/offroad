import {materialToDocx, materialToPdf, materialToPptx} from "@offroad/case-export";
import {deliverableFormatAllowed, deliverableFormatBlockCopy} from "@offroad/case-export/deliverable-formats";
import {renderApprovedInstitutionalFinancialWorkbook} from "@offroad/financial-model";
import {requireWorkspace} from "@/lib/auth/workspace";
import {loadInstitutionalModelResult} from "@/lib/advisor/institutional-model-results";
import {institutionalResultMaterial} from "@/lib/advisor/institutional-result-material";
import {institutionalResultDeliverableContext, institutionalResultDeliverableTypes} from "@/lib/advisor/institutional-result-formats";
import {presentationTemplateForProject} from "@/lib/advisor/presentation-template";

const formats = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pdf: "application/pdf",
} as const;
type Params = {params: Promise<{locale: string; projectId: string; resultId: string; format: string}>};

export async function GET(_request: Request, {params}: Params) {
  const {locale, projectId, resultId, format} = await params;
  if (!Object.hasOwn(formats, format)) return new Response("Not found", {status: 404});
  const {supabase} = await requireWorkspace(locale);
  const result = await loadInstitutionalModelResult(supabase, projectId);
  const lang = locale === "en-US" ? "en" : "pt";
  if (!result || result.id !== resultId) {
    return new Response(lang === "pt" ? "Este resultado precisa de uma nova revisão ou ainda está sendo preparado." : "This result needs a new review or is still being prepared.", {status: 409});
  }
  // The same policy the surface showed, repeated here: a copied link never reaches a format the
  // delivery does not allow, and a superseded result is never served as the current one.
  const policy = deliverableFormatAllowed(institutionalResultDeliverableTypes, format, institutionalResultDeliverableContext(result));
  if (!policy.allowed) return new Response(deliverableFormatBlockCopy[policy.block][lang], {status: policy.block === "format_not_in_policy" ? 404 : 409});
  const artifact = result.artifact!;
  // Every format first passes the same input/output/fingerprint replay as the workbook.
  const workbook = await renderApprovedInstitutionalFinancialWorkbook(artifact, lang);
  if (!workbook) return new Response(deliverableFormatBlockCopy.reproduction_divergence[lang], {status: 409});
  let bytes = workbook;
  if (format !== "xlsx") {
    // The visual identity selected for this project, with its fingerprint bound into the file.
    const {template} = await presentationTemplateForProject(supabase, projectId);
    const material = institutionalResultMaterial(artifact, lang);
    const input = {material, lang, meta: {issuedOn: result.createdAt.slice(0, 10), template}} as const;
    bytes = format === "docx" ? materialToDocx(input) : format === "pptx" ? await materialToPptx(input) : await materialToPdf(input);
  }
  return new Response(Buffer.from(bytes), {headers: {
    "content-type": formats[format as keyof typeof formats],
    "content-disposition": `attachment; filename="${lang === "pt" ? "Cenarios_aprovados" : "Approved_scenarios"}_${result.createdAt.slice(0,10)}.${format}"`,
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
  }});
}
