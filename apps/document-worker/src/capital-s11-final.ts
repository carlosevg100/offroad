/** Versioned final transformation, shared by production and recovery. No authority inference. */
import {z} from "zod";
import {capitalPlanningMapSchema} from "@offroad/domain-contracts";
import {researchSourceSchema,type ResearchSource} from "@offroad/public-research";
export const capitalS11ArtifactSchema=capitalPlanningMapSchema.safeExtend({schemaVersion:z.literal("capital-planning-map.v1"),asOfDate:z.iso.date(),
 company:z.strictObject({name:z.string().min(1),website:z.string().nullable()}),
 sources:z.array(researchSourceSchema.pick({title:true,url:true,topic:true,publishedAt:true,provider:true}).strict()),researchStatus:z.enum(["succeeded","partial","abstained"]),
 scopeBoundary:z.string().min(1),provenance:z.strictObject({provider:z.enum(["anthropic","openai"]),model:z.string().min(1),executorVersion:z.literal("2026.09.24-v2")})}).strict();
export function transformCapitalS11FinalProduct(input:{parsed:unknown;company:{name:string;website:string|null};locale:"pt-BR"|"en-US";asOfDate:string;sources:ResearchSource[];researchStatus:"succeeded"|"partial"|"abstained";accepted:{provider:"anthropic"|"openai";reportedModel:string}}){
 const allowed=new Set(input.sources.map(source=>source.url)),parsed=capitalPlanningMapSchema.parse(input.parsed);
 const planningMap={...parsed,alternatives:parsed.alternatives.map(alternative=>({...alternative,sourceUrls:alternative.sourceUrls.filter(url=>allowed.has(url))}))};
 const recommendationValid=planningMap.directionalRecommendation.status==="not_ready"?planningMap.directionalRecommendation.alternativeId===null:planningMap.alternatives.some(alternative=>alternative.id===planningMap.directionalRecommendation.alternativeId);
 const noUnsupportedTerms=!/(?:R\$|US\$|BRL|USD)\s*\d|\b\d+(?:[.,]\d+)?\s*%|\b(?:CDI|SOFR)\s*[+~-]\s*\d/i.test(JSON.stringify(planningMap));
 const qualityResults=[{id:"schema_valid",passed:capitalPlanningMapSchema.safeParse(planningMap).success},{id:"citations_allowed",passed:planningMap.alternatives.every(alternative=>alternative.sourceUrls.every(url=>allowed.has(url)))},
 {id:"recommendation_consistent",passed:recommendationValid},{id:"no_invented_terms",passed:noUnsupportedTerms}];
 const finalProduct=capitalS11ArtifactSchema.parse({schemaVersion:"capital-planning-map.v1",asOfDate:input.asOfDate,company:input.company,...planningMap,
 sources:input.sources.map(({title,url,topic,publishedAt,provider})=>({title,url,topic,publishedAt,provider})),researchStatus:input.researchStatus,
 scopeBoundary:input.locale==="pt-BR"?"Mapa direcional baseado na necessidade declarada e em informações públicas. Não contém sizing, pricing, confirmação jurídica, decisão de crédito ou garantia de execução.":"Directional map based on the stated need and public information. It contains no sizing, pricing, legal confirmation, credit decision or assurance of execution.",
 provenance:{provider:input.accepted.provider,model:input.accepted.reportedModel,executorVersion:"2026.09.24-v2"}});
 return {finalProduct,qualityResults};
}
