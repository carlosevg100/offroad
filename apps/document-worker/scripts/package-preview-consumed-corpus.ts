/** Called during the image build. Copies the exact finite consumed set only. */
import {mkdir,readFile,writeFile} from "node:fs/promises";
import {resolve} from "node:path";
import {createInstalledPreviewCorpus} from "../src/integration-preview-installed-corpus";
const [source,destination,...extra]=process.argv.slice(2);
if(!source||!destination||extra.length)throw Error("Two explicit corpus directories required");
const root=resolve(source),target=resolve(destination);
if(root===target)throw Error("Separate packaging destination required");
const corpus=createInstalledPreviewCorpus(root,JSON.parse(await readFile(resolve(root,"manifest.json"),"utf8")));
await mkdir(target,{recursive:true});
for(const item of corpus.manifest.entries)await writeFile(resolve(target,item.file),await corpus.extraction(item.file),{flag:"wx"});
await writeFile(resolve(target,"manifest.json"),JSON.stringify(corpus.manifest),{flag:"wx"});
console.log(JSON.stringify({schemaVersion:"capital-preview-package-proof.v1",files:corpus.manifest.entries.length,bytes:corpus.manifest.entries.reduce((sum,item)=>sum+item.bytes,0)}));
