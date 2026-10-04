import {readFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {describe,it,expect} from "vitest";
import {createInstalledPreviewCorpus,selectInstalledPreviewCorpus} from "./integration-preview-installed-corpus";
const dir=new URL('../../../docs/product/gold-cases/runs/gc01/ai-review-corpus/',import.meta.url),manifest=JSON.parse(readFileSync(new URL('manifest.json',dir),'utf8'));
describe('finite preview packaging / no publication authority',()=>{
 it('selects only the actual seventeen sources and preserves non-UTF8 CSV bytes',async()=>{
  const corpus=createInstalledPreviewCorpus(fileURLToPath(dir),manifest);expect(corpus.manifest.entries).toHaveLength(17);
  for(const entry of corpus.manifest.entries){const bytes=await corpus.extraction(entry.file);expect(bytes.length).toBe(entry.bytes);expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.sha256);}
  expect(corpus.manifest.entries.some(item=>item.file==='anbima_ettj_2026-09-04.csv')).toBe(true);
 });
 it('denies foreign or traversing filenames before filesystem I/O',async()=>{
  const corpus=createInstalledPreviewCorpus('/does-not-exist',manifest);
  await expect(corpus.extraction('../01_ITR_1T26_31mai2026.txt')).rejects.toThrow('extraction_denied');
  await expect(corpus.extraction('cvm_ipe_2026_camil.csv')).rejects.toThrow('extraction_denied');
 });
 it('rejects incomplete or changed source manifest without guessing additions',()=>{
  expect(()=>selectInstalledPreviewCorpus({...manifest,entries:[]})).toThrow();
 });
});
