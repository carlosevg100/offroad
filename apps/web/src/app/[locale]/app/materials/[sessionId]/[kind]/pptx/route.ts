import {serveGovernedMaterialFile} from "@/lib/artifacts/material-download";

/** The material as a deck of one exact artifact revision (`?revision=`, or the head of the case's materials). */

type Params = {params: Promise<{locale: string; sessionId: string; kind: string}>};

export async function GET(request: Request, {params}: Params) {
  return serveGovernedMaterialFile(request, await params, "pptx");
}
