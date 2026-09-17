import {expect,it} from "vitest";
import {formatBasisValue} from "./adoption-basis-format";
const labels={absent:"Sem escolha",yes:"Sim",no:"Não"};
it("preserves exact decimal digits while rendering the locale",()=>{
 expect(formatBasisValue({type:"number",value:"9007199254740993.123456789"},"pt-BR",labels)).toBe("9.007.199.254.740.993,123456789");
 expect(formatBasisValue({type:"number",value:"-0.00100"},"en-US",labels)).toBe("-0.00100");
});
it("distinguishes absent values from zero and does not expose JSON quotes",()=>{
 expect(formatBasisValue(null,"pt-BR",labels)).toBe("Sem escolha");
 expect(formatBasisValue({type:"number",value:"0"},"pt-BR",labels)).toBe("0");
 expect(formatBasisValue({type:"text",value:"300"},"pt-BR",labels)).toBe("300");
 expect(formatBasisValue({type:"boolean",value:false},"pt-BR",labels)).toBe("Não");
});
