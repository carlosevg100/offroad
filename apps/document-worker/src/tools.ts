import {readdir, readFile, writeFile} from "node:fs/promises";
import {join} from "node:path";
import {runTool, withTempDirectory, type DocumentConverter} from "@offroad/document-parsers";

export {createTesseractEngine, parseTesseractTsv, runTool, toolVersion, withTempDirectory} from "@offroad/document-parsers";

/**
 * The two capabilities the parsers package refuses to implement itself, because they need
 * the outside world: converting a legacy Office file and reading glyphs from an image.
 *
 * Both are external programs fed with an untrusted file, so each run is boxed in the same
 * way: a private temp directory that is deleted afterwards, a hard timeout, the process
 * killed if it overruns, no shell interpolation (arguments are passed as an array, never a
 * command string), and an output size cap. The container gives them no network and no
 * credentials, so the blast radius of a malicious document is a dead job.
 */

const conversionTargets: Record<string, {to: string; mime: string; extension: string}> = {
  "application/msword": {to: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx"},
  "application/rtf": {to: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx"},
  "text/rtf": {to: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx"},
  "application/vnd.oasis.opendocument.text": {to: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx"},
  "application/vnd.wordperfect": {to: "docx", mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", extension: "docx"},
  "application/vnd.ms-powerpoint": {to: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: "pptx"},
  "application/vnd.oasis.opendocument.presentation": {to: "pptx", mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", extension: "pptx"},
};

export function createLibreOfficeConverter(options: {bin: string; timeoutMs: number; version?: string}): DocumentConverter {
  return {
    name: "libreoffice",
    version: options.version ?? "unknown",
    supports: (mime) => mime in conversionTargets,

    async convert(input) {
      const target = conversionTargets[input.mime];
      if (!target) throw new Error(`no conversion target for "${input.mime}"`);

      return withTempDirectory(async (directory) => {
        // A fixed name: the original file name is attacker-controlled and has no business
        // reaching a command line or a filesystem path.
        const sourcePath = join(directory, "source");
        await writeFile(sourcePath, input.bytes);

        const result = await runTool(
          options.bin,
          [
            "--headless",
            "--norestore",
            "--safe-mode",
            "--nolockcheck",
            "--nodefault",
            `-env:UserInstallation=file://${join(directory, "profile")}`,
            "--convert-to",
            target.to,
            "--outdir",
            directory,
            sourcePath,
          ],
          {timeoutMs: options.timeoutMs, cwd: directory},
        );

        const produced = (await readdir(directory)).find((name) => name.startsWith("source.") && name.endsWith(target.to));
        if (!produced) {
          throw new Error(`conversion produced no ${target.to} file${result.stderr ? `: ${result.stderr}` : ""}`);
        }

        const bytes = new Uint8Array(await readFile(join(directory, produced)));
        return {bytes, mime: target.mime, fileName: `converted.${target.extension}`};
      });
    },
  };
}
