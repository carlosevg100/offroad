"use client";

import {useEffect, useRef} from "react";

export function HeroBackgroundVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const syncPlayback = () => {
      if (motionPreference.matches) {
        video.pause();
        return;
      }

      void video.play().catch(() => undefined);
    };

    syncPlayback();
    motionPreference.addEventListener("change", syncPlayback);
    return () => motionPreference.removeEventListener("change", syncPlayback);
  }, []);

  return (
    <div aria-hidden="true" className="premium-hero__media">
      <video
        disablePictureInPicture
        loop
        muted
        playsInline
        poster="/media/offroad-capital-hero-loop-v1-poster.jpg"
        preload="metadata"
        ref={videoRef}
        tabIndex={-1}
      >
        <source src="/media/offroad-capital-hero-loop-v1.mp4" type="video/mp4" />
        <source src="/media/offroad-capital-hero-loop-v1.webm" type="video/webm" />
      </video>
    </div>
  );
}
