import {Plus} from "lucide-react";
import styles from "./public-narrative.module.css";

type Copy = typeof import("../../messages/pt-BR.json")["Website"]["solutionDepth"];
export function PublicSolutionDetail({solution, copy: c}: {solution: "strategy" | "execution" | "intelligence"; copy: Copy}) {
  return <section className={styles.section}><div className={styles.heading}><h2>{c.title}</h2></div><div className={styles.solutionDepth}>{(["one", "two", "three", "four"] as const).map((key,i) => <details className={styles.methodItem} key={key}><summary><span>0{i + 1}</span><h3>{c[solution][key].title}</h3><Plus size={20} aria-hidden="true"/></summary><p>{c[solution][key].body}</p><div className={styles.solutionValue}><span>{c.output}</span><p>{c[solution][key].value}</p></div></details>)}</div></section>;
}
