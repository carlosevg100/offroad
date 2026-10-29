/** A message the system wrote into the conversation (metadata origin system), never the person's words: the screen shows
 * it as a notice of Offroad, by its own copy, never with the message text or an author. */
export type SystemNotice = "documentFolderResume";
export function systemNoticeOf(metadata: unknown): SystemNotice | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  if (m.origin !== "system") return null;
  return m.kind === "document_folder_resume" ? "documentFolderResume" : null;
}
/** Whether a message is the system's: shown as Offroad's notice, never as the person's. */
export const isSystemMessage = (metadata: unknown) => {
  const m = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : null;
  return m?.origin === "system";
};
