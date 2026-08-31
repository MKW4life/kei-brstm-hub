"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./VolumeControl.module.css";

type VolumeControlProps = {
  volume: number;
  onVolumeChange: (volume: number) => void;
};

const MAX_VOLUME = 0.5;

export default function VolumeControl({
  volume,
  onVolumeChange,
}: VolumeControlProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const safeVolume = Math.min(MAX_VOLUME, Math.max(0, volume));
  const displayPercent = Math.round(safeVolume * 100);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (
        open &&
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        className={`${styles.toggle} ${open ? styles.toggleOpen : ""}`}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-label="音量設定"
        title={`音量 ${displayPercent}%`}
      >
        <svg
          className={styles.speaker}
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            d="M4 9.5v5h4l5 4V5.5l-5 4H4Z"
            fill="currentColor"
          />
          {safeVolume > 0 && (
            <path
              d="M16 9a4.2 4.2 0 0 1 0 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          )}
          {safeVolume >= 0.25 && (
            <path
              d="M18.3 6.6a7.3 7.3 0 0 1 0 10.8"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          )}
        </svg>

        <span className={styles.chevron}>{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className={styles.panel}>
          <div className={styles.top}>
            <span>VOLUME</span>
            <strong>{displayPercent}%</strong>
          </div>

          <input
            className={styles.slider}
            type="range"
            min="0"
            max="0.5"
            step="0.01"
            value={safeVolume}
            onChange={(event) =>
              onVolumeChange(
                Math.min(MAX_VOLUME, Math.max(0, Number(event.target.value)))
              )
            }
            aria-label="プレビュー音量"
          />

          <div className={styles.scale}>
            <span>0%</span>
            <span>25%</span>
            <span>50%</span>
          </div>

          <div className={styles.actions}>
            <button type="button" onClick={() => onVolumeChange(0)}>
              Mute
            </button>
            <button type="button" onClick={() => onVolumeChange(0.25)}>
              25%
            </button>
            <button type="button" onClick={() => onVolumeChange(0.5)}>
              50%
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
