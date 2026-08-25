import type {Database, Json} from "@/types/database";

/** Where an intake session is being driven from. It only changes navigation and post-confirmation hooks. */
export type IntakeContext = "onboarding" | "workspace";

export type IntakeSession = Database["public"]["Tables"]["document_intake_sessions"]["Row"];
export type IntakeCandidate = Database["public"]["Tables"]["intake_field_candidates"]["Row"];
export type IntakeIssue = Database["public"]["Tables"]["intake_issues"]["Row"];
export type IntakeDocument = Pick<Database["public"]["Tables"]["source_documents"]["Row"], "id" | "original_name" | "byte_size" | "object_path"> & {signedUrl?: string};
export type IntakeDocumentSummary = Pick<Database["public"]["Tables"]["source_documents"]["Row"], "id" | "original_name" | "byte_size">;

export type IntakeCandidateInsert = Database["public"]["Tables"]["intake_field_candidates"]["Insert"];
export type IntakeIssueInsert = Database["public"]["Tables"]["intake_issues"]["Insert"];
export type EvidenceFactInsert = Database["public"]["Tables"]["evidence_facts"]["Insert"];

export type IntakeDecision = "accept" | "edit" | "reject" | "not_applicable";
export const intakeDecisions: readonly IntakeDecision[] = ["accept", "edit", "reject", "not_applicable"] as const;

export type IntakeReviewActionSet = {
  accept: (formData: FormData) => Promise<void>;
  confirm: (formData: FormData) => Promise<void>;
  process: (formData: FormData) => Promise<void>;
  resolve: (formData: FormData) => Promise<void>;
  review: (formData: FormData) => Promise<void>;
  resolveScopeSuggestion?: (formData: FormData) => Promise<void>;
  revokeAuthorization?: (formData: FormData) => Promise<void>;
};

export type IntakeStartActionSet = {
  start: (formData: FormData) => Promise<void>;
  manual: (formData: FormData) => Promise<void>;
};

/** Error codes carried in the `?error=` query parameter by intake actions. */
export type IntakeErrorCode =
  | "documents"
  | "processing"
  | "confirmation"
  | "validation"
  | "session"
  | "save"
  | "step"
  | "duplicate"
  | "remove"
  /** The month's model spend for this organization is at its ceiling. Retrying will not help. */
  | "capacity";

export type CandidateValue = Json;
