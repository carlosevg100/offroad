import {readFileSync,readdirSync} from "node:fs";
import {resolve} from "node:path";
import {createTranslator} from "next-intl";
import {describe,expect,it} from "vitest";
import pt from "../../messages/pt-BR.json";
import en from "../../messages/en-US.json";
import {selectClientMessages} from "./client-messages";

const sourceRoot=resolve(process.cwd(),"src");
const clients=readdirSync(sourceRoot,{recursive:true}).filter((file):file is string=>typeof file==="string"&&file.endsWith(".tsx")&&!file.endsWith(".test.tsx")).map(file=>({file,source:readFileSync(resolve(sourceRoot,file),"utf8")})).filter(({source})=>/^['"]use client['"];/.test(source));
describe("locale layout client messages",()=>{
 it.each([['pt-BR',pt],['en-US',en]] as const)("provides every namespace actually consumed by client components in %s",(locale,messages)=>{
  const selected=selectClientMessages(messages);
  for(const {file,source} of clients){
   for(const match of source.matchAll(/useTranslations\(['"]([^'"]+)['"]\)/g)){
    const namespace=match[1]!;
    const value=namespace.split('.').reduce<unknown>((node,key)=>node&&typeof node==='object'?(node as Record<string,unknown>)[key]:undefined,selected);
    expect(value,`${file}: ${namespace}`).toBeDefined();
   }
  }
  const errors:unknown[]=[];
  const translate=createTranslator({locale,messages:selected,onError:error=>errors.push(error)});
  expect(translate('ProviderCaseFitForm.submit')).toBe(messages.ProviderCaseFitForm.submit);
  expect(translate('InstitutionalSetup.title')).toBe(messages.InstitutionalSetup.title);
  expect(translate('InstitutionalModelResult.title')).toBe(messages.InstitutionalModelResult.title);
  expect(errors).toEqual([]);
  expect(selected).not.toHaveProperty('Home');
 });
});
