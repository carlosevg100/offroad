import {describe, expect, it} from "vitest";
import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";

import enUS from "../../messages/en-US.json";
import ptBR from "../../messages/pt-BR.json";

/**
 * House style, enforced.
 *
 * The em dash is banned in everything a person reads: the message catalogues, the copy inside
 * the domain packages, and the prompts that write prose on our behalf. It is a founder decision
 * and not a matter of taste to relitigate, which is exactly why it belongs in a test rather than
 * in a style guide nobody opens.
 *
 * The prompt half matters more than it looks. A model imitates the register of its instructions,
 * so a system prompt that used em dashes while forbidding them would have produced one in every
 * paragraph of every credit brief. `BRIEF_SYSTEM` now bans them explicitly, and this test guards
 * both the ban and the prompt that carries it.
 *
 * Code comments are out of scope: they are documentation for whoever maintains this, not copy.
 * The markdown is not. The ledgers, the handoff and the ADRs are prose the founder reads, and
 * they held 271 of the character until they were swept; without a check here they simply come
 * back, one pull request at a time.
 */

const EM_DASH = "—";

/** Every string in a message catalogue, with the key path that would let somebody find it. */
function* strings(node: unknown, path: readonly string[] = []): Generator<{path: string; value: string}> {
  if (typeof node === "string") {
    yield {path: path.join("."), value: node};
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      yield* strings(value, [...path, key]);
    }
  }
}

describe("no em dash reaches a reader", () => {
  it.each([
    ["pt-BR", ptBR],
    ["en-US", enUS],
  ])("%s message catalogue", (_locale, catalogue) => {
    const offenders = [...strings(catalogue)].filter((entry) => entry.value.includes(EM_DASH));
    expect(offenders.map((entry) => `${entry.path}: ${entry.value}`)).toEqual([]);
  });

  it("the copy inside the domain packages", () => {
    // Walks the packages rather than importing them: the copy lives in object literals of many
    // shapes, and reading the source catches a string wherever somebody chose to put it.
    const root = join(import.meta.dirname, "../../../../packages");
    const offenders: string[] = [];

    const isComment = (line: string) => {
      const trimmed = line.trim();
      return trimmed.startsWith("*") || trimmed.startsWith("//") || trimmed.startsWith("/*");
    };

    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, {withFileTypes: true})) {
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "dist") continue;
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".ts") || entry.name.includes(".test.")) continue;
        // The one file allowed to contain the character is the prompt that forbids it, since a
        // rule has to name what it bans.
        if (entry.name === "brief.ts") continue;

        readFileSync(full, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (line.includes(EM_DASH) && !isComment(line)) {
              offenders.push(`${full.slice(root.length + 1)}:${index + 1}  ${line.trim().slice(0, 120)}`);
            }
          });
      }
    };

    walk(root);
    expect(offenders).toEqual([]);
  });

  it("the markdown a person reads", () => {
    // The repository's own prose: ledgers, handoff, ADRs, operating rules. Not the code comments
    // beside them, and not `node_modules` or build output.
    const root = join(import.meta.dirname, "../../../..");
    const offenders: string[] = [];

    const walk = (directory: string) => {
      for (const entry of readdirSync(directory, {withFileTypes: true})) {
        if (entry.name.startsWith(".")) continue;
        const full = join(directory, entry.name);
        if (entry.isDirectory()) {
          if (entry.name === "node_modules" || entry.name === "dist" || entry.name === "coverage") continue;
          walk(full);
          continue;
        }
        if (!entry.name.endsWith(".md")) continue;

        readFileSync(full, "utf8")
          .split("\n")
          .forEach((line, index) => {
            if (line.includes(EM_DASH)) {
              offenders.push(`${full.slice(root.length + 1)}:${index + 1}  ${line.trim().slice(0, 120)}`);
            }
          });
      }
    };

    for (const directory of ["docs"]) walk(join(root, directory));
    for (const file of ["AGENTS.md", "README.md", "handoff.md", "CLAUDE.md"]) {
      readFileSync(join(root, file), "utf8")
        .split("\n")
        .forEach((line, index) => {
          if (line.includes(EM_DASH)) offenders.push(`${file}:${index + 1}  ${line.trim().slice(0, 120)}`);
        });
    }

    expect(offenders).toEqual([]);
  });
});
