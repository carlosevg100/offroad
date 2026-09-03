import {z} from "zod";

export const executableWorkspaceJobSchema = z.enum([
  "company_debt_view",
  "origination_thesis",
  "capital_planning",
  "structure_from_documents",
  "review_existing_operation",
  "prepare_materials_and_process",
]);
export type ExecutableWorkspaceJob = z.infer<typeof executableWorkspaceJobSchema>;
