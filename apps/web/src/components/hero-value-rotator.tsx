"use client";

import {useEffect, useMemo, useRef, useState} from "react";

type HeroValueItem = {
  label: string;
  message: string;
};

type HeroValueRotatorProps = {
  items: ReadonlyArray<HeroValueItem>;
  lead: string;
  tail: string;
};

const ROTATION_INTERVAL_MS = 3000;
const TRANSITION_DURATION_MS = 560;

export function HeroValueRotator({items, lead, tail}: HeroValueRotatorProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [previousIndex, setPreviousIndex] = useState<number | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const activeIndexRef = useRef(0);

  const longestLabel = useMemo(
    () => items.reduce((longest, item) => item.label.length > longest.length ? item.label : longest, ""),
    [items],
  );
  const longestMessage = useMemo(
    () => items.reduce((longest, item) => item.message.length > longest.length ? item.message : longest, ""),
    [items],
  );

  useEffect(() => {
    if (items.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let transitionTimer: ReturnType<typeof setTimeout> | undefined;
    const rotationTimer = setInterval(() => {
      const currentIndex = activeIndexRef.current;
      const nextIndex = (currentIndex + 1) % items.length;

      setPreviousIndex(currentIndex);
      activeIndexRef.current = nextIndex;
      setActiveIndex(nextIndex);
      setIsTransitioning(true);

      if (transitionTimer) clearTimeout(transitionTimer);
      transitionTimer = setTimeout(() => {
        setIsTransitioning(false);
        setPreviousIndex(null);
      }, TRANSITION_DURATION_MS);
    }, ROTATION_INTERVAL_MS);

    return () => {
      clearInterval(rotationTimer);
      if (transitionTimer) clearTimeout(transitionTimer);
    };
  }, [items.length]);

  if (items.length === 0) return null;

  const activeItem = items[activeIndex];
  const previousItem = previousIndex === null ? null : items[previousIndex];

  return (
    <div className="hero-value-rotator">
      <p className="hero-value-rotator__headline">
        <span>{lead}</span>
        <span className="hero-value-rotator__word-slot">
          <span aria-hidden="true" className="hero-value-rotator__word-sizer">{longestLabel}</span>
          {previousItem && isTransitioning ? (
            <span aria-hidden="true" className="hero-value-rotator__word is-leaving">
              {previousItem.label}
            </span>
          ) : null}
          <span className={`hero-value-rotator__word${isTransitioning ? " is-entering" : ""}`}>
            {activeItem.label}
          </span>
        </span>
        <span>{tail}</span>
      </p>

      <div className="hero-value-rotator__support" aria-live="polite" aria-atomic="true">
        <span aria-hidden="true" className="hero-value-rotator__support-sizer">{longestMessage}</span>
        {previousItem && isTransitioning ? (
          <span aria-hidden="true" className="hero-value-rotator__support-copy is-leaving">
            {previousItem.message}
          </span>
        ) : null}
        <span className={`hero-value-rotator__support-copy${isTransitioning ? " is-entering" : ""}`}>
          {activeItem.message}
        </span>
      </div>
    </div>
  );
}
