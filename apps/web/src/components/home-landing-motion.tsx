"use client";

import {useEffect} from "react";

export function HomeLandingMotion() {
  useEffect(() => {
    const revealItems = [...document.querySelectorAll<HTMLElement>("[data-oc-reveal]")];
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.setAttribute("data-visible", "true");
      }),
      {threshold: 0.12},
    );
    revealItems.forEach((item) => observer.observe(item));

    const hero = document.querySelector<HTMLElement>("[data-oc-hero]");
    const parallaxItems = [...document.querySelectorAll<HTMLElement>("[data-oc-parallax]")];
    const onPointerMove = (event: PointerEvent) => {
      if (!hero) return;
      const rect = hero.getBoundingClientRect();
      const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
      parallaxItems.forEach((item) => {
        item.style.setProperty("--mx", String(x));
        item.style.setProperty("--my", String(y));
      });
    };
    hero?.addEventListener("pointermove", onPointerMove);

    const prompt = document.querySelector<HTMLElement>("[data-oc-prompt]");
    const prompts = prompt ? JSON.parse(prompt.dataset.prompts ?? "[]") as string[] : [];
    let promptIndex = 0;
    const promptTimer = window.setInterval(() => {
      if (!prompt || prompts.length < 2) return;
      prompt.setAttribute("data-changing", "true");
      window.setTimeout(() => {
        promptIndex = (promptIndex + 1) % prompts.length;
        prompt.textContent = prompts[promptIndex];
        prompt.removeAttribute("data-changing");
      }, 220);
    }, 3600);

    const liveItems = [...document.querySelectorAll<HTMLElement>("[data-oc-live]")];
    const taskItems = [...document.querySelectorAll<HTMLElement>("[data-oc-task]")];
    const insight = document.querySelector<HTMLElement>("[data-oc-insight]");
    const insights = insight ? JSON.parse(insight.dataset.insights ?? "[]") as string[][] : [];
    let workIndex = 0;
    const workTimer = window.setInterval(() => {
      workIndex = (workIndex + 1) % Math.max(liveItems.length, 1);
      liveItems.forEach((item, index) => item.setAttribute("data-active", String(index === workIndex)));
      taskItems.forEach((item, index) => {
        item.setAttribute("data-active", String(index === workIndex));
        const marker = item.querySelector("i");
        if (marker) marker.textContent = index < workIndex ? "✓" : String(index + 1);
      });
      if (insight && insights[workIndex]) {
        insight.setAttribute("data-changing", "true");
        window.setTimeout(() => {
          const label = insight.querySelector("span");
          const title = insight.querySelector("h4");
          if (label) label.textContent = insights[workIndex][0];
          if (title) title.textContent = insights[workIndex][1];
          insight.removeAttribute("data-changing");
        }, 210);
      }
    }, 3900);

    return () => {
      observer.disconnect();
      hero?.removeEventListener("pointermove", onPointerMove);
      window.clearInterval(promptTimer);
      window.clearInterval(workTimer);
    };
  }, []);

  return null;
}
