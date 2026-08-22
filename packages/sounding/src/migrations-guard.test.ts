import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

/**
 * The stage and event lists live twice: in this package and in the check constraints of
 * sounding_investors and sounding_events. A new stage added here and not there is refused at
 * insert with a constraint error nobody reads. This test is the look, made permanent.
 */
const migrationsDir = join(__dirname, "..", "..", "..", "supabase", "migrations");
const migrationSql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

const stages = ["listed", "teaser_sent", "nda_signed", "room_opened", "indicated", "declined", "allocated", "dropped"] as const;
const eventTypes = ["listed", "teaser_sent", "nda_signed", "room_opened", "question_asked", "question_answered", "indication_received", "declined", "allocated", "dropped"] as const;

describe("the database knows every sounding stage and event type", () => {
  it.each(stages)("stage %s is in the stage check", (stage) => {
    expect(migrationSql).toMatch(new RegExp(`stage text[^\\n]*'${stage}'`));
  });
  it.each(eventTypes)("event %s is in the event_type check", (type) => {
    expect(migrationSql).toMatch(new RegExp(`event_type text[^\\n]*'${type}'`));
  });
});
