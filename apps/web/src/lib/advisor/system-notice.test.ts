import {describe, expect, it} from "vitest";
import {isSystemMessage, systemNoticeOf} from "./system-notice";

describe("system notices in the conversation", () => {
  it("reads the folder resume the database writes as Offroad's notice, never a person's message", () => {
    const resume = {kind: "document_folder_resume", origin: "system", waitId: "w", projectId: "p"};
    expect(systemNoticeOf(resume)).toBe("documentFolderResume");
    expect(isSystemMessage(resume)).toBe(true);
    for (const m of [{kind: "message", projectId: "p"}, {kind: "document_folder_resume"}, null, [], "x"]) {
      expect(systemNoticeOf(m)).toBeNull();
      expect(isSystemMessage(m)).toBe(false);
    }
  });
});
