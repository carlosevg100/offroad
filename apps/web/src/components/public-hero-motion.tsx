"use client";

import {useEffect, useRef, useState} from "react";
import {Pause, Play} from "lucide-react";
import styles from "./public-hero.module.css";

export function PublicHeroMotion({pause, play}: {pause:string; play:string}) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const connection = (navigator as Navigator & {connection?: {saveData?:boolean}}).connection;
    const sync = () => {
      if (preference.matches || connection?.saveData || document.hidden) video.pause();
      else if (!video.dataset.userPaused) {
        if (!video.getAttribute("src")) video.src = "/media/offroad-office-loop-v2.mp4";
        void video.play().catch(() => {});
      }
    };
    sync();
    preference.addEventListener("change", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      preference.removeEventListener("change", sync);
      document.removeEventListener("visibilitychange", sync);
      video.pause();
    };
  }, []);
  function toggle() {
    const video = ref.current;
    if (!video) return;
    if (video.paused) {
      delete video.dataset.userPaused;
      if (!video.getAttribute("src")) video.src = "/media/offroad-office-loop-v2.mp4";
      void video.play().catch(() => setFailed(true));
    } else {
      video.dataset.userPaused = "true";
      video.pause();
    }
  }
  return <>
    <video ref={ref} className={styles.video} data-ready={ready && !failed} muted loop playsInline preload="none" aria-hidden="true" tabIndex={-1} onPlaying={() => {setReady(true); setPlaying(true);}} onPause={() => setPlaying(false)} onError={() => {setFailed(true); setPlaying(false);}}/>
    <button type="button" className={styles.motionControl} onClick={toggle} hidden={failed} aria-label={playing ? pause : play} title={playing ? pause : play}>{playing ? <Pause size={15} aria-hidden="true"/> : <Play size={15} aria-hidden="true"/>}</button>
  </>;
}
