import {readdirSync, readFileSync} from "node:fs";
import {join} from "node:path";

import {describe, expect, it} from "vitest";

import {documentKindSchema} from "@offroad/credit-ontology";

import {archetypeIdSchema} from "./types";

/**
 * The database keeps its own lists of document kinds and archetypes, in check constraints, and
 * it does not read these packages. `customer_concentration` was added to the ontology on 21/08
 * and reached the constraint a day later, by accident of someone looking: in between, a
 * correctly classified customer sheet would have had its profile refused at insert. This is the
 * look, made permanent. It lives here rather than in the ontology because the ontology package
 * is browser-safe and has no Node types.
 */
const migrationsDir = join(__dirname, "..", "..", "..", "supabase", "migrations");
const migrationSql = readdirSync(migrationsDir)
  .filter((name) => name.endsWith(".sql"))
  .sort()
  .map((name) => readFileSync(join(migrationsDir, name), "utf8"))
  .join("\n");

describe("the database knows every document kind", () => {
  it.each(documentKindSchema.options)("%s appears in a migration's document_kind check", (kind) => {
    expect(migrationSql).toContain(`'${kind}'`);
  });
});

describe("the database knows every archetype", () => {
  it.each(archetypeIdSchema.options)("%s appears in a migration's archetype check", (id) => {
    expect(migrationSql).toContain(`'${id}'`);
  });
});
