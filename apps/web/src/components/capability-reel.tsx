"use client";

import {useEffect, useState} from "react";

type CapabilityReelProps = {
  items: ReadonlyArray<string>;
  label: string;
};

const ROTATION_INTERVAL_MS = 4200;

export function CapabilityReel({items, label}: CapabilityReelProps) {
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (items.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % items.length);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [items.length]);

  if (items.length === 0) return null;

  const previousIndex = (activeIndex - 1 + items.length) % items.length;

  return (
    <div className="capability-reel" aria-label={label}>
      <div className="capability-reel__mark" aria-hidden="true"><span>+</span></div>
      <div className="capability-reel__viewport">
        <div className="capability-reel__stage" key={activeIndex}>
          <p className="capability-reel__previous" aria-hidden="true">{items[previousIndex]}</p>
          <p className="capability-reel__current" aria-live="polite" aria-atomic="true">{items[activeIndex]}</p>
        </div>
      </div>
      <span className="capability-reel__counter" aria-hidden="true">
        {String(activeIndex + 1).padStart(2, "0")} / {String(items.length).padStart(2, "0")}
      </span>
    </div>
  );
}
