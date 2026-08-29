"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./KeiProjectRail.module.css";

type KeiProjectRailProps = {
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  showVolume?: boolean;
};

const loungeCardsUrl = "https://kei-lounge-cards.vercel.app/";

export default function KeiProjectRail({
  volume = 0.5,
  onVolumeChange,
  showVolume = true,
}: KeiProjectRailProps) {
  const [projectsOpen, setProjectsOpen] = useState(false);

  return (
    <aside className={styles.rail} aria-label="Kei project tools">
      {showVolume && onVolumeChange && (
        <div className={styles.volumeDock}>
          <div className={styles.volumeTop}>
            <span className={styles.volumeTitle}>VOLUME</span>
            <strong>{Math.round(volume * 100)}%</strong>
          </div>

          <input
            className={styles.volumeSlider}
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(event) => onVolumeChange(Number(event.target.value))}
            aria-label="Preview volume"
          />

          <div className={styles.volumeActions}>
            <button type="button" onClick={() => onVolumeChange(0)}>
              Mute
            </button>
            <button type="button" onClick={() => onVolumeChange(0.2)}>
              20%
            </button>
            <button type="button" onClick={() => onVolumeChange(0.5)}>
              50%
            </button>
          </div>
        </div>
      )}

      <div className={styles.projectArea}>
        <button
          className={styles.projectButton}
          type="button"
          onClick={() => setProjectsOpen((current) => !current)}
          aria-expanded={projectsOpen}
        >
          Kei Projects
        </button>

        {projectsOpen && (
          <div className={styles.projectPanel}>
            <a
              className={styles.projectItem}
              href={loungeCardsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Kei Lounge Cards
            </a>

            <Link className={styles.projectItem} href="/">
              Kei Music Hub
            </Link>
          </div>
        )}
      </div>
    </aside>
  );
}
