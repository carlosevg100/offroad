import {execFileSync} from "node:child_process";
import {join} from "node:path";
import {expect, type Page} from "@playwright/test";

/** Preserve coverage of existing customers without turning registration into a company. */
export async function useLegacyCompanyFixture(page: Page, email: string) {
  const databaseUrl = process.env.OFFROAD_E2E_DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
  for (const value of [databaseUrl, page.url(), process.env.NEXT_PUBLIC_SUPABASE_URL ?? "http://127.0.0.1:54321"]) {
    if (!["127.0.0.1", "localhost", "[::1]"].includes(new URL(value).hostname)) {
      throw new Error("Legacy workspace fixtures require local synthetic services.");
    }
  }
  await expect(page).toHaveURL(/\/pt-BR\/app(?:\?|$)/);
  execFileSync("psql", [databaseUrl, "-qAt", "-v", "ON_ERROR_STOP=1", "-v", `email=${email}`,
    "-f", join(__dirname, "legacy-workspace-local.sql")], {encoding: "utf8"});
  await page.goto("/pt-BR/onboarding");
}
