import {randomBytes} from "node:crypto";
import {expect,test} from "@playwright/test";

// Presence of attacker-controlled parameters selects a verification operation; it
// must never create a session without the Auth server accepting the credential.
for (const kind of ["token_hash","code","both"] as const) {
  test(`auth confirmation rejects invalid ${kind} without granting workspace access`,async({page})=>{
    const query=new URLSearchParams({next:"/pt-BR/app"});
    if(kind!=="code") {query.set("token_hash",randomBytes(32).toString("hex"));query.set("type","signup");}
    if(kind!=="token_hash")query.set("code",randomBytes(32).toString("hex"));
    await page.goto(`/pt-BR/auth/confirm?${query}`);
    await expect(page).toHaveURL(/\/pt-BR\/auth\/error$/);
    await page.goto("/pt-BR/app");
    await expect(page).toHaveURL(/\/pt-BR\/login(?:\?|$)/);
  });
}
