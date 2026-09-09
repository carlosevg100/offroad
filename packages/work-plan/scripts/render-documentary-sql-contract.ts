import {writeFileSync} from "node:fs";
import {documentWorkPlanSnapshot} from "../src/document-work-plan";

// Release contract, not case data. Re-run only while preparing an unapplied migration.
const contracts = Object.fromEntries((["structure_from_documents", "review_existing_operation"] as const).map(entry => [entry, documentWorkPlanSnapshot(entry)]));
const json = JSON.stringify(contracts, null, 2);
writeFileSync("supabase/tests/support/documentary_plan_snapshots.sql", `-- Generated from the real documentWorkPlanSnapshot compiler; no case-specific data.\ncreate function pg_temp.documentary_plan_fixture(p_entry text) returns jsonb\nlanguage sql immutable set search_path='' as $fixture_function$\n  select $documentary_contract$${json}$documentary_contract$::jsonb -> p_entry;\n$fixture_function$;\n`);
