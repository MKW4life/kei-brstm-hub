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
const projectsUrl = process.env.NEXT_PUBLIC_KEI_PROJECTS_URL?.trim() || "https://kei-projects-33b53.web.app/";
const courseStatsUrl = process.env.NEXT_PUBLIC_MKW_COURSE_STATS_URL?.trim() || "https://mkw-trackstats.pages.dev/";

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
            {projectsUrl && (
              <a className={styles.projectItem} href={projectsUrl}>
                Kei Projects ホーム
              </a>
            )}

            <Link className={styles.projectItem} href="/">
              Kei BRSTM Hub
            </Link>

            <a
              className={styles.projectItem}
              href={loungeCardsUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Kei Lounge Card
            </a>

            <a
              className={styles.projectItem}
              href={loungeCardsUrl + "item-counter"}
              target="_blank"
              rel="noopener noreferrer"
            >
              MKW Item Counter
            </a>

            {courseStatsUrl && (
              <a
                className={styles.projectItem}
                href={courseStatsUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                MKW Course Stats
              </a>
            )}
          </div>
        )}
      </div>
    </aside>
  );
}
