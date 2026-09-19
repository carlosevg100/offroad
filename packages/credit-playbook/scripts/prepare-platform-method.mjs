// Reads immutable main source bytes and emits a reviewable command payload, without DB access.
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
const root = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const [commit, manifestPath, technicalReviewPath, contentApprovalPath, author, output] = process.argv.slice(2);
if (!commit || !/^[a-f0-9]{40}$/.test(commit) || !output || !author) throw new Error('usage: node prepare-platform-method.mjs COMMIT MANIFEST_PATH TECHNICAL_REVIEW_PATH CONTENT_APPROVAL_PATH AUTHOR OUTPUT');
const git = (...args) => execFileSync('git', args, {cwd: root, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
if (git('remote','get-url','origin').trim() !== 'https://github.com/carlosevg100/offroad.git') throw new Error('untrusted repository');
git('merge-base','--is-ancestor',commit,'origin/main');
const readSource = (path) => {
  if (!path || path.startsWith('/') || path.includes('\\') || path.split('/').includes('..') || (!path.startsWith('packages/') && !['pnpm-lock.yaml','tsconfig.base.json'].includes(path))) throw new Error('invalid source path');
  const row = git('ls-tree',commit,'--',path).trim();
  if (!row.startsWith('100644 blob ') && !row.startsWith('100755 blob ')) throw new Error('source must be a regular committed file');
  return git('show',`${commit}:${path}`);
};
const require = createRequire(join(root,'apps/document-worker/package.json'));
const {build} = require('esbuild');
const temporary = await mkdtemp(join(tmpdir(),'offroad-platform-method-'));
try {
  const outfile=join(temporary,'prepare.mjs');
  await build({entryPoints:[join(root,'packages/credit-playbook/src/platform-method-publication.ts')],outfile,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent'});
  const {preparePlatformMethodPublication}=await import(pathToFileURL(outfile));
  const prepared=preparePlatformMethodPublication({manifest:JSON.parse(readSource(manifestPath)),sourceCommit:commit,author,technicalReviewPath,contentApprovalPath,readSource,now:new Date()});
  await writeFile(resolve(output),JSON.stringify(prepared,null,2)+'\n',{flag:'wx',mode:0o600});
  console.log(JSON.stringify({releaseId:prepared.releaseId,sourceCommit:commit,grantsExecution:false,output:resolve(output)}));
} finally {await rm(temporary,{recursive:true,force:true});}
