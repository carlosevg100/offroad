import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {compileAdvisorStartingPlan, providerResearchPlanSnapshot} from "@offroad/work-plan";

/** Explicit historical fixture: preserves the old consumer's E2E coverage without
 * advertising its intake-bound executor as a new standalone conversation capability.
 * It seeds only the legacy context, never an approval, model reply or result. */
export function startLegacyConversation(email: string, prompt: string, research = false): string {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(databaseUrl).hostname)) throw new Error("Legacy fixtures require a local synthetic database");
  const plan = research ? providerResearchPlanSnapshot() : compileAdvisorStartingPlan({message: prompt, hasAttachments: false, documentaryEnabled: false}).plan;
  const output = execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1",
    "-v", `email=${email}`, "-v", `prompt=${prompt}`, "-v", `plan=${JSON.stringify(plan)}`,
    "-v", `research=${research}`, "-f", join(__dirname, "legacy-conversation-local.sql")], {encoding: "utf8"});
  const workId = output.trim().split("\n").findLast(line => /^[0-9a-f-]{36}$/.test(line));
  if (!workId) throw new Error("Legacy work fixture did not return an identity");
  return workId;
}
