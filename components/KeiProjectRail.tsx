"use client";

import { useState } from "react";
import Link from "next/link";
import styles from "./KeiProjectRail.module.css";

type KeiProjectRailProps = {
  // Kept for compatibility with older admin/public calls.
  volume?: number;
  onVolumeChange?: (volume: number) => void;
  showVolume?: boolean;
};

const loungeCardsUrl = "https://kei-lounge-cards.vercel.app/";

export default function KeiProjectRail(_props: KeiProjectRailProps) {
  const [projectsOpen, setProjectsOpen] = useState(false);

  return (
    <aside className={styles.rail} aria-label="Kei Projects">
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
