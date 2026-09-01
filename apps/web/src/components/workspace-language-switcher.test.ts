import {describe, expect, it} from "vitest";

import {localizedWorkspaceHref} from "./workspace-language-switcher";

describe("workspace language switcher", () => {
  it("keeps the same project and query while changing only the locale", () => {
    expect(localizedWorkspaceHref(
      "/pt-BR/app/projects/11111111-1111-4111-8111-111111111111",
      "artifact=meeting_brief",
      "en-US",
    )).toBe("/en-US/app/projects/11111111-1111-4111-8111-111111111111?artifact=meeting_brief");
  });

  it("can return to Portuguese without forking project state", () => {
    expect(localizedWorkspaceHref("/en-US/app", "", "pt-BR")).toBe("/pt-BR/app");
  });
});
