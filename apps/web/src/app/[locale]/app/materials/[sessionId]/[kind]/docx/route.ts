import {serveGovernedMaterialFile} from "@/lib/artifacts/material-download";

/**
 * The material as a Word file: the term sheet and the covenant definitions are negotiated in
 * tracked changes, and that happens in .docx, not in a print dialog. Built deterministically from
 * the same persisted blocks the HTML renders, for one exact artifact revision (`?revision=`, or the
 * head of the case's materials), so the two never say different things.
 */

type Params = {params: Promise<{locale: string; sessionId: string; kind: string}>};

export async function GET(request: Request, {params}: Params) {
  return serveGovernedMaterialFile(request, await params, "docx");
}
