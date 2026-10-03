/** Test-only v9 term-sheet replay. All first-party source bytes are captured;
 * no historical executor resolves a current first-party implementation. */
import {readFileSync,mkdtempSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,posix,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=resolve(fileURLToPath(new URL('../../..',import.meta.url))),sha=v=>createHash('sha256').update(v).digest('hex');
export const historicalTermSheetSourceCommit='111591e6572667f04c56e74381178c716ac2b56d';
export const historicalTermSheetSnapshotHash='3a26d5d52e8b0426c42e0c4cc2bd6941fb4874f68937249c69350e36a5c02744';
let loaded;export function loadHistoricalTermSheet(){return loaded??=load();}
async function load(){
 const bytes=readFileSync(join(root,'packages/deal-structure/scripts/fixtures/termsheet-v9-runtime.sources.json'));if(sha(bytes)!==historicalTermSheetSnapshotHash)throw Error('historical_termsheet_snapshot_hash_mismatch');const fixture=JSON.parse(bytes);
 if(fixture.sourceCommit!==historicalTermSheetSourceCommit||sha(fixture.entry)!==fixture.entryHash||sha(readFileSync(join(root,'pnpm-lock.yaml')))!==fixture.lockHash)throw Error('historical_termsheet_identity_mismatch');
 for(const[path,file]of Object.entries(fixture.files)){const content=Buffer.from(file.content);if(sha(content)!==file.hash||createHash('sha1').update(Buffer.from('blob '+content.length+'\0')).update(content).digest('hex')!==file.gitBlob)throw Error('historical_termsheet_source_hash_mismatch:'+path);}
 const require=createRequire(join(root,'apps/document-worker/package.json')),esbuild=require('esbuild');if(require('decimal.js/package.json').version!=='10.6.0'||require('zod/package.json').version!=='4.4.3')throw Error('historical_termsheet_dependency_version_mismatch');if(esbuild.version!==fixture.esbuildVersion)throw Error('historical_termsheet_bundler_version_mismatch');
 const resolveSource=input=>{const path=posix.normalize(input);for(const candidate of[path,path+'.ts',path+'/index.ts'])if(fixture.files[candidate])return candidate;throw Error('historical_termsheet_uncaptured_source');};
 const temporary=mkdtempSync(join(tmpdir(),'offroad-v9-termsheet-'));
 try{const outfile=join(temporary,'runtime.mjs');await esbuild.build({entryPoints:['entry'],outfile,bundle:true,platform:'node',format:'esm',target:'node24',logLevel:'silent',plugins:[{name:'immutable-v9-termsheet',setup(b){b.onResolve({filter:/.*/},args=>{
 if(args.kind==='entry-point')return{path:'entry',namespace:'historical'};if(args.path.startsWith('node:'))return{path:args.path,external:true};
 if(args.path.startsWith('.'))return{path:resolveSource(posix.join(posix.dirname(args.importer),args.path)),namespace:'historical'};
 if(args.path.startsWith('@offroad/')){const parts=args.path.slice(9).split('/'),pkg=parts.shift(),base='packages/'+pkg,meta=fixture.files[base+'/package.json'];if(!meta)throw Error('historical_termsheet_uncaptured_package');const out=JSON.parse(meta.content).exports[parts.length?'./'+parts.join('/') :'.'];return{path:resolveSource(base+'/'+(typeof out==='string'?out:out.default)),namespace:'historical'};}
 if(!['decimal.js','zod'].includes(args.path))throw Error('historical_termsheet_unknown_dependency');return{path:require.resolve(args.path),external:true};
 });b.onLoad({filter:/.*/,namespace:'historical'},args=>({contents:args.path==='entry'?fixture.entry:fixture.files[args.path].content,loader:args.path==='entry'?'js':fixture.files[args.path].loader}));}}]});return await import(pathToFileURL(outfile));}finally{rmSync(temporary,{recursive:true,force:true});}
}
