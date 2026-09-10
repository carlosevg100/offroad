import {buildInitialInstitutionalConfigurationCandidate} from "@offroad/financial-model";
import {institutionalInputFixture} from "../../../../../packages/financial-model/src/institutional-input.fixture";
import type {InstitutionalSetupContext} from "./institutional-setup-reader";
export function setupReviewFixture():InstitutionalSetupContext {
 const f=institutionalInputFixture();const actor="10000000-0000-4000-8000-000000000001",stamp="2026-09-10T00:00:00Z";
 const sourceBindings=f.sources.map(s=>({...s,metadataEvidence:{locator:"Synthetic financials",rationale:"Reviewed units"},reviewedBy:actor,reviewedAt:stamp}));
 const result=buildInitialInstitutionalConfigurationCandidate({...f,reviewedSources:sourceBindings,currentSources:f.sources.map(s=>({...s,hashVerified:true})),actorId:actor,submittedAt:stamp,submissionId:actor});
 if(result.status!=="review_required")throw new Error("Fixture candidate not reviewable");
 return {projectId:actor,intakeSessionId:actor,sourceManifestFingerprint:"a".repeat(64),currentSources:f.sources.map(s=>({...s,hashVerified:true,originalName:"Synthetic accounts"})),candidates:[],latestSubmission:null,configurationReviews:[{candidateId:actor,revision:1,status:"review_required",configuration:result.configuration,configurationFingerprint:result.configurationFingerprint,parentFingerprint:null,answerEvidence:{kind:"initial_configuration",sourceManifestFingerprint:"a".repeat(64),submittedAt:stamp,lineage:result.lineage,sourceBindings,review:result.review}}]};
}
