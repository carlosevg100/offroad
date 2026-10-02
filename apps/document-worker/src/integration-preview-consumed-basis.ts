/** Finite provenance of the inputs actually delivered to the preview executors.
 * This map is a reconstruction pin; it does not publish a source or grant reuse.
 * A frozen number copied from another calculation remains a captured input unless
 * the caller supplies the real matching predecessor artifact separately. */
import {z} from "zod";
import {preview} from "@offroad/credit-playbook";
import {fingerprintJson} from "@offroad/case-understanding";

const manifestSchema=z.strictObject({schemaVersion:z.literal("ai-review-corpus.v1"),caseId:z.literal("gc01-analista-ib-camil"),extractor:z.string(),entries:z.array(z.strictObject({file:z.string(),bytes:z.number().int().positive(),sha256:z.string().regex(/^[a-f0-9]{64}$/)}))});
/** Explicit aliases to the installed extraction, never a guessed filename. */
const aliases:Readonly<Record<string,string>>={
 "01_ITR_1T26_31mai2026.pdf":"01_ITR_1T26_31mai2026.txt",
 "02_Proposta_Administracao_AGOE_2026.pdf":"02_Proposta_Administracao_AGOE_2026.txt",
 "af_11a_emissao.pdf":"af_11a_emissao.txt","af_13a_emissao.pdf":"af_13a_emissao.txt",
 "af_14a_emissao.pdf":"af_14a_emissao.txt","af_15a_emissao.pdf":"af_15a_emissao.txt",
 "ca_notas_comerciais_2026-05-27.pdf":"ca_notas_comerciais_2026-05-27.txt",
 "ca_operacao_estruturada_2026-05-27.pdf":"ca_operacao_estruturada_2026-05-27.txt",
 "cra_257_relatorio_mensal_4t25.pdf":"cra_257_relatorio_mensal_4t25.txt",
 "cra_292_termo_securitizacao.pdf":"cra_292_termo_securitizacao.txt",
 "escritura_11a_emissao.pdf":"escritura_11a_emissao.txt","escritura_13a_emissao.pdf":"escritura_13a_emissao.txt",
 "escritura_14a_emissao.pdf":"escritura_14a_emissao.txt","escritura_15a_emissao.pdf":"escritura_15a_emissao.txt",
 "ri_release_1t26.pdf":"ri_release_1t26.txt",
};
const inputReasons:Readonly<Record<string,string>>={
 "03_Pedido_Simulado_CRA_2026.docx":"synthetic_request",
 "calendario_sintetico_teste.md":"declared_test_calendar",
 "fixture_hipotetico.md":"declared_hypothesis",
 "calendario_anbima_2026.csv":"calendar_not_in_corpus_declared_upper_bound",
 "anbima_ntnb_2026-09-02.csv":"quote_not_in_corpus",
 "b3_pre_di_2026-09-03.csv":"quote_not_in_corpus",
 "declaracao_do_usuario.md":"captured_user_declaration",
 "reference-data.ts":"captured_versioned_parameter",
 "gc02-gabarito-rascunho.md":"captured_frozen_calculation_no_live_predecessor_proof",
 "exit-costs-gc01.json":"captured_frozen_calculation_no_live_predecessor_proof",
};
export type PreviewConsumedAnchor={taskId:string;path:string;document:string;basis:
 {kind:"corpus";file:string;sha256:string;byteLength:number}|{kind:"captured_input";reason:string;inputFingerprint:string}};

/** Map is an actual executor input for synthesis. Capture its entries explicitly;
 * silently hashing a Map as {} would erase the economic objects it consumed. */
export function capturePreviewActualInput(value:unknown):unknown{
 if(value instanceof Map)return{schemaVersion:"capital-preview-input-map.v1",entries:[...value.entries()].map(([key,body])=>({key,body:capturePreviewActualInput(body)}))};
 if(Array.isArray(value))return value.map(capturePreviewActualInput);
 if(value&&typeof value==="object")return Object.fromEntries(Object.entries(value).map(([key,body])=>[key,capturePreviewActualInput(body)]));
 if(value===null||typeof value==="string"||typeof value==="boolean"||typeof value==="number")return value;
 throw new Error("capital_preview_input_not_json");
}
/** Pre-dispatch pin only for bodies already available. The final complete
 * consumed-basis pin is created after both generated components exist. */
export function compilePreviewBoundaryBasis(input:{boundary:"questions"|"synthesis";contextFingerprint:string;sourceBasisFingerprint:string;predecessorInputs:Readonly<Record<string,unknown>>;modelInputFingerprint:string}){
 const body={schemaVersion:"capital-preview-boundary-basis.v1"as const,...input,predecessorInputs:capturePreviewActualInput(input.predecessorInputs)};
 return{...body,fingerprint:fingerprintJson(body)};
}

export function compilePreviewConsumedBasis(input:{composition:preview.PreviewComposition;inputs:Readonly<Record<string,unknown>>;corpusManifest:unknown}){
 const manifest=manifestSchema.parse(input.corpusManifest),steps=preview.previewStepsForComposition(input.composition);
 if(new Set(manifest.entries.map(e=>e.file)).size!==manifest.entries.length)throw new Error("capital_preview_corpus_duplicate");
 const wanted=steps.map(s=>s.taskId).sort(),observed=Object.keys(input.inputs).sort();
 if(fingerprintJson(wanted)!==fingerprintJson(observed))throw new Error("capital_preview_actual_inputs_incomplete");
 const anchors:PreviewConsumedAnchor[]=[];
 for(const step of steps){const body=capturePreviewActualInput(input.inputs[step.taskId]),inputFingerprint=fingerprintJson(body);
  const add=(document:string,path:string)=>{const file=aliases[document]??document,entry=manifest.entries.find(e=>e.file===file);
   if(entry)anchors.push({taskId:step.taskId,path,document,basis:{kind:"corpus",file,sha256:entry.sha256,byteLength:entry.bytes}});
   else if(inputReasons[document])anchors.push({taskId:step.taskId,path,document,basis:{kind:"captured_input",reason:inputReasons[document]!,inputFingerprint}});
   else throw new Error("capital_preview_anchor_unmapped");};
  const walk=(value:unknown,path:string)=>{if(Array.isArray(value)){value.forEach((v,i)=>walk(v,`${path}/${i}`));return;}
   if(value===null||typeof value!=="object")return;
   const object=value as Record<string,unknown>;
   if(typeof object.document==="string")add(object.document,`${path}/document`);
   // Document registers use name rather than document. Their supplied SHA is
   // never substituted for the installed extraction hash.
   if((path.startsWith("/documents/")||path.startsWith("/manifest/"))&&typeof object.name==="string")add(object.name,`${path}/name`);
   for(const [key,child]of Object.entries(object))walk(child,`${path}/${key}`);
  };walk(body,"");
 }
 const files=[...new Set(anchors.flatMap(a=>a.basis.kind==="corpus"?[a.basis.file]:[]))].sort();
 const basis={schemaVersion:"capital-preview-consumed-basis.v1"as const,composition:input.composition,
  inputFingerprints:steps.map(s=>({taskId:s.taskId,fingerprint:fingerprintJson(capturePreviewActualInput(input.inputs[s.taskId]))})),anchors,
  entries:files.map(file=>manifest.entries.find(e=>e.file===file)!) };
 return{...basis,fingerprint:fingerprintJson(basis)};
}
