"use client";

import {useEffect, useRef, type ReactNode} from "react";
import styles from "./public-visual-home.module.css";

/** Progressive enhancement: content stays visible without JavaScript or motion support. */
export function PublicScrollEffects({children}: {children: ReactNode}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = ref.current;
    if (!root || !window.IntersectionObserver || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const nodes = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]"));
    const observer = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) {
        (entry.target as HTMLElement).dataset.revealed = "true";
        observer.unobserve(entry.target);
      }
    }, {threshold:0, rootMargin:"0px 0px -24px 0px"});
    for (const node of nodes) {
      if (node.getBoundingClientRect().top < window.innerHeight) node.dataset.revealed = "true";
      else observer.observe(node);
    }
    root.dataset.motion = "active";
    return () => {observer.disconnect(); delete root.dataset.motion;};
  }, []);
  return <div ref={ref} className={styles.home}>{children}</div>;
}
