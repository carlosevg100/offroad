import {describe, expect, it} from "vitest";
import {auditVoice, type VoiceString} from "@offroad/credit-playbook";

import enUS from "../../messages/en-US.json";
import ptBR from "../../messages/pt-BR.json";

/**
 * The voice filter over the copy of the application itself.
 *
 * Every string under the `App` namespace reaches a reader on screen, so it is held to the same
 * house voice as a packet: no dash, no emoji, no system speaking as an AI, no filler, no
 * certainty about a third party, no bad-faith framing. Those are blocked. The warn rules
 * (superlatives, a verdict without its number, a stamped label) are listed for review rather
 * than enforced here, because rewriting catalogue copy is the founder's act, not a test's.
 */

/** Every string in a message catalogue, with the key path that would let somebody find it. */
function* strings(node: unknown, path: readonly string[]): Generator<VoiceString> {
  if (typeof node === "string") {
    yield {id: path.join("."), text: node};
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) yield* strings(value, [...path, key]);
  }
}

describe("the App catalogue passes the voice filter", () => {
  it.each([
    ["pt-BR", ptBR],
    ["en-US", enUS],
  ])("%s App namespace carries no blocked voice pattern", (_locale, catalogue) => {
    const entries = [...strings(catalogue.App, ["App"])];
    expect(entries.length).toBeGreaterThan(0);
    const blocked = auditVoice(entries, {channel: "catalogue"})
      .filter((finding) => finding.severity === "block")
      .map((finding) => `${finding.stringId} ${finding.ruleId} ${finding.code}: ${finding.excerpt}`);
    expect(blocked).toEqual([]);
  });
});
