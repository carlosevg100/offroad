import {describe,it,expect} from "vitest";
import {parseInstitutionalSetupReviews} from "./institutional-setup-reviews";
import {setupReviewFixture} from "./institutional-setup-reviews.fixture";
describe("initial institutional review reader",()=>{
 it("renders a real producer configuration with a null parent",()=>{const [r]=parseInstitutionalSetupReviews(setupReviewFixture());expect(r.canApprove).toBe(true);expect(r.parentFingerprint).toBeNull();expect(r.sources[0].name).toBe("Synthetic accounts");expect(r.assumptions.length).toBeGreaterThan(0);});
 it("rejects altered full configuration and malformed sources",()=>{const c=setupReviewFixture();const raw=c.configurationReviews[0] as {configuration:{currency:string};answerEvidence:{sourceBindings:unknown[]}};raw.configuration.currency="USD";expect(parseInstitutionalSetupReviews(c)).toEqual([]);const d=setupReviewFixture();(d.configurationReviews[0] as typeof raw).answerEvidence.sourceBindings=[];expect(parseInstitutionalSetupReviews(d)).toEqual([]);});
 it("retains rejection but prevents approval after source replacement",()=>{const c=setupReviewFixture();c.sourceManifestFingerprint="b".repeat(64);expect(parseInstitutionalSetupReviews(c)[0].canApprove).toBe(false);});
 it("prevents stale-parent approval and blocked calculation approval",()=>{const c=setupReviewFixture();const raw=c.configurationReviews[0] as {parentFingerprint:string|null;answerEvidence:{review:{status:string}}};raw.parentFingerprint="b".repeat(64);expect(parseInstitutionalSetupReviews(c)[0].canApprove).toBe(false);raw.parentFingerprint=null;raw.answerEvidence.review.status="blocked";expect(parseInstitutionalSetupReviews(c)[0].canApprove).toBe(false);});
});
