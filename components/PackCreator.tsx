"use client";

import { useMemo, useState, type DragEvent } from "react";
import { createStoredZip, type ZipEntry } from "@/lib/simpleZip";
import styles from "./PackCreator.module.css";

type PackTrack = {
  id: number;
  title: string;
  title_en: string;
  category: string;
  tags: string;
  brstm_url: string;
  preview_url: string;
  brstm_lap3_url: string;
  preview_lap3_url: string;
};

type Slot = {
  id: string;
  ja: string;
  en: string;
  outputNormal: string;
  supportsLap3: boolean;
  assignmentKey?: string;
  icon?: string;
};

type SlotGroup = {
  id: string;
  ja: string;
  en: string;
  icon?: string;
  toolIcon?: boolean;
  slots: Slot[];
};

const raceGroups: SlotGroup[] = [
  {
    id: "mushroom",
    ja: "キノコカップ",
    en: "Mushroom Cup",
    icon: "/pack-icons/65px-MKW_Mushroom_Cup_Icon.webp",
    slots: [
      { id: "luigi", ja: "ルイージサーキット", en: "Luigi Circuit", outputNormal: "n_circuit32_n", supportsLap3: true, assignmentKey: "shared-n-circuit32" },
      { id: "moo", ja: "モーモーカントリー", en: "Moo Moo Meadows", outputNormal: "n_farm_n", supportsLap3: true },
      { id: "gorge", ja: "キノコキャニオン", en: "Mushroom Gorge", outputNormal: "n_kinoko_n", supportsLap3: true },
      { id: "factory", ja: "キノピオファクトリー", en: "Toad's Factory", outputNormal: "STRM_N_FACTORY_N", supportsLap3: true },
    ],
  },
  {
    id: "flower",
    ja: "フラワーカップ",
    en: "Flower Cup",
    icon: "/pack-icons/65px-MKW_Flower_Cup_Icon.webp",
    slots: [
      { id: "mario", ja: "マリオサーキット", en: "Mario Circuit", outputNormal: "n_circuit32_n", supportsLap3: true, assignmentKey: "shared-n-circuit32" },
      { id: "mall", ja: "ココナッツモール", en: "Coconut Mall", outputNormal: "n_shopping32_n", supportsLap3: true },
      { id: "summit", ja: "DK スノーボードクロス", en: "DK Summit", outputNormal: "n_snowboard32_n", supportsLap3: true },
      { id: "mine", ja: "ワリオこうざん", en: "Wario's Gold Mine", outputNormal: "STRM_N_TRUCK_N", supportsLap3: true },
    ],
  },
  {
    id: "star",
    ja: "スターカップ",
    en: "Star Cup",
    icon: "/pack-icons/65px-MKW_Star_Cup_Icon.webp",
    slots: [
      { id: "daisy", ja: "デイジーサーキット", en: "Daisy Circuit", outputNormal: "n_daisy32_n", supportsLap3: true },
      { id: "cape", ja: "ノコノコみさき", en: "Koopa Cape", outputNormal: "STRM_N_WATER_N", supportsLap3: true },
      { id: "treeway", ja: "メイプルツリーハウス", en: "Maple Treeway", outputNormal: "n_maple_n", supportsLap3: true },
      { id: "volcano", ja: "グラグラかざん", en: "Grumble Volcano", outputNormal: "n_volcano32_n", supportsLap3: true },
    ],
  },
  {
    id: "special",
    ja: "スペシャルカップ",
    en: "Special Cup",
    icon: "/pack-icons/65px-MKW_Special_Cup_Icon.webp",
    slots: [
      { id: "ruins", ja: "カラカラいせき", en: "Dry Dry Ruins", outputNormal: "STRM_N_DESERT_N", supportsLap3: true },
      { id: "highway", ja: "ムーンリッジ&ハイウェイ", en: "Moonview Highway", outputNormal: "STRM_N_RIDGEHIGHWAY_N", supportsLap3: true },
      { id: "bc", ja: "クッパキャッスル", en: "Bowser's Castle", outputNormal: "STRM_N_KOOPA_N", supportsLap3: true },
      { id: "rr", ja: "レインボーロード", en: "Rainbow Road", outputNormal: "n_Rainbow32_n", supportsLap3: true },
    ],
  },
  {
    id: "shell",
    ja: "こうらカップ",
    en: "Shell Cup",
    icon: "/pack-icons/65px-MKW_Shell_Cup_Icon.webp",
    slots: [
      { id: "gcnbeach", ja: "GC ピーチビーチ", en: "GCN Peach Beach", outputNormal: "r_gc_beach32_n", supportsLap3: true },
      { id: "yoshi", ja: "DS ヨッシーフォールズ", en: "DS Yoshi Falls", outputNormal: "r_ds_jungle32_n", supportsLap3: true },
      { id: "ghost", ja: "SFC おばけぬま2", en: "SNES Ghost Valley 2", outputNormal: "r_sfc_obake32_n", supportsLap3: true },
      { id: "raceway", ja: "64 マリオサーキット", en: "N64 Mario Raceway", outputNormal: "r_64_circuit32_n", supportsLap3: true },
    ],
  },
  {
    id: "banana",
    ja: "バナナカップ",
    en: "Banana Cup",
    icon: "/pack-icons/65px-MKW_Banana_Cup_Icon.webp",
    slots: [
      { id: "sherbet", ja: "64 シャーベットランド", en: "N64 Sherbet Land", outputNormal: "r_64_sherbet32_n", supportsLap3: true },
      { id: "shyguy", ja: "GBA ヘイホービーチ", en: "GBA Shy Guy Beach", outputNormal: "r_agb_beach32_n", supportsLap3: true },
      { id: "delfino", ja: "DS モンテタウン", en: "DS Delfino Square", outputNormal: "r_ds_town32_n", supportsLap3: true },
      { id: "waluigi", ja: "GC ワルイージスタジアム", en: "GCN Waluigi Stadium", outputNormal: "r_gc_stadium32_n", supportsLap3: true },
    ],
  },
  {
    id: "leaf",
    ja: "このはカップ",
    en: "Leaf Cup",
    icon: "/pack-icons/65px-MKW_Leaf_Cup_Icon.webp",
    slots: [
      { id: "desert", ja: "DS サンサンさばく", en: "DS Desert Hills", outputNormal: "r_ds_desert32_n", supportsLap3: true },
      { id: "gba-bc", ja: "GBA クッパキャッスル3", en: "GBA Bowser Castle 3", outputNormal: "r_agb_kuppa32_n", supportsLap3: true },
      { id: "parkway", ja: "64 DK ジャングルパーク", en: "N64 DK's Jungle Parkway", outputNormal: "r_64_jungle32_n", supportsLap3: true },
      { id: "gcn-mario", ja: "GC マリオサーキット", en: "GCN Mario Circuit", outputNormal: "r_gc_circuit32_n", supportsLap3: true },
    ],
  },
  {
    id: "lightning",
    ja: "サンダーカップ",
    en: "Lightning Cup",
    icon: "/pack-icons/65px-MKW_Lightning_Cup_Icon.webp",
    slots: [
      { id: "snes-mario", ja: "SFC マリオサーキット3", en: "SNES Mario Circuit 3", outputNormal: "r_sfc_circuit32_n", supportsLap3: true },
      { id: "gardens", ja: "DS ピーチガーデン", en: "DS Peach Gardens", outputNormal: "r_ds_garden32_n", supportsLap3: true },
      { id: "mountain", ja: "GC DK マウンテン", en: "GCN DK Mountain", outputNormal: "r_gc_mountain32_n", supportsLap3: true },
      { id: "n64-bc", ja: "64 クッパキャッスル", en: "N64 Bowser's Castle", outputNormal: "r_64_kuppa32_n", supportsLap3: true },
    ],
  },
];

const battleGroups: SlotGroup[] = [
  {
    id: "battle-wii",
    ja: "Wii ステージ",
    en: "Wii Stages",
    icon: "/pack-icons/65px-MKW_Wii_Stages_Icon.webp",
    slots: [
      { id: "block", ja: "ブロックひろば", en: "Block Plaza", outputNormal: "n_block_n", supportsLap3: false },
      { id: "venice", ja: "アクアリゾート", en: "Delfino Pier", outputNormal: "n_venice_n", supportsLap3: false },
      { id: "skate", ja: "ファンキースタジアム", en: "Funky Stadium", outputNormal: "n_skate_n", supportsLap3: false },
      { id: "casino", ja: "ワンワンルーレット", en: "Chain Chomp Wheel", outputNormal: "n_casino_n", supportsLap3: false },
      { id: "ryuusa", ja: "ドッスンさばく", en: "Thwomp Desert", outputNormal: "n_ryuusa_n", supportsLap3: false },
    ],
  },
  {
    id: "battle-retro",
    ja: "レトロステージ",
    en: "Retro Stages",
    icon: "/pack-icons/65px-MKW_Retro_Stages_Icon.webp",
    slots: [
      { id: "sfc-battle", ja: "SFC バトルコース4", en: "SNES Battle Course 4", outputNormal: "r_sfc_battle_n", supportsLap3: false },
      { id: "gba-battle", ja: "GBA バトルコース3", en: "GBA Battle Course 3", outputNormal: "r_agb_battle_n", supportsLap3: false },
      { id: "n64-battle", ja: "64 まてんろう", en: "N64 Skyscraper", outputNormal: "r_64_battle_n", supportsLap3: false },
      { id: "gcn-battle", ja: "GC クッキーランド", en: "GCN Cookie Land", outputNormal: "r_GC_Battle32_n", supportsLap3: false },
      { id: "ds-battle", ja: "DS ゆうやみハウス", en: "DS Twilight House", outputNormal: "r_ds_battle_n", supportsLap3: false },
    ],
  },
];

const optionGroups: SlotGroup[] = [
  {
    id: "options",
    ja: "オプション・ファンファーレ",
    en: "Options & Fanfares",
    toolIcon: true,
    slots: [
      { id: "option", ja: "オプション", en: "Options", outputNormal: "o_Option_32", supportsLap3: false },
      { id: "wifi-wait", ja: "Wi-Fi 観戦中・タイムアタックのリプレイ", en: "Wi-Fi spectator / Time Trial replay", outputNormal: "o_Wi-Fi_waiting32", supportsLap3: false },
      { id: "wifi-intro", ja: "3、2、1の音に入る前のイントロ (Wi-Fi)", en: "Wi-Fi pre-countdown intro", outputNormal: "o_Crs_In_Fan_Wifi", supportsLap3: false },
      { id: "first", ja: "レースで1位を獲得した時", en: "1st place fanfare", outputNormal: "o_FanfareGP1_32", supportsLap3: false, icon: "/pack-icons/1stMKW.webp" },
      { id: "upper", ja: "レースで上位を取得した時", en: "Upper-place fanfare", outputNormal: "o_FanfareGP2_32", supportsLap3: false, icon: "/pack-icons/120px-6thMKW.webp" },
      { id: "lower", ja: "レースで下位になった時", en: "Lower-place fanfare", outputNormal: "o_FanfareGPdame_32", supportsLap3: false, icon: "/pack-icons/120px-12thMKW.webp" },
    ],
  },
];

const allGroups = [...raceGroups, ...battleGroups, ...optionGroups];

function assignmentKey(slot: Slot) {
  return slot.assignmentKey || slot.id;
}

function lap3OutputName(normal: string) {
  if (normal.endsWith("_n")) {
    return `${normal.slice(0, -2)}_f`;
  }

  if (normal.endsWith("_N")) {
    return `${normal.slice(0, -2)}_F`;
  }

  return "";
}

function displayTrackTitle(track: PackTrack, language: "ja" | "en") {
  return language === "en" ? track.title_en || track.title : track.title;
}

export default function PackCreator({
  tracks,
  language,
  volume,
  playingKey,
  onPreview,
}: {
  tracks: PackTrack[];
  language: "ja" | "en";
  volume: number;
  playingKey: string | null;
  onPreview: (
    track: PackTrack,
    previewUrl: string,
    label: string
  ) => void;
}) {
  const [assignments, setAssignments] = useState<Record<string, number>>({});
  const [query, setQuery] = useState("");
  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [building, setBuilding] = useState(false);
  const [progress, setProgress] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const trackMap = useMemo(
    () => new Map(tracks.map((track) => [track.id, track])),
    [tracks]
  );

  const filteredTracks = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    return tracks
      .filter((track) =>
        [
          track.title,
          track.title_en,
          track.tags,
          track.category,
        ]
          .join(" ")
          .toLowerCase()
          .includes(keyword)
      )
      .sort((a, b) =>
        displayTrackTitle(a, language).localeCompare(
          displayTrackTitle(b, language)
        )
      );
  }, [tracks, query, language]);

  const assignedKeys = Object.keys(assignments).filter(
    (key) => assignments[key] != null
  );

  function assignTrack(slot: Slot, trackId: number) {
    setAssignments((current) => ({
      ...current,
      [assignmentKey(slot)]: trackId,
    }));
    setSelectedTrackId(trackId);
  }

  function clearSlot(slot: Slot) {
    const key = assignmentKey(slot);

    setAssignments((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function handleDrop(slot: Slot, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const id = Number(event.dataTransfer.getData("text/kei-brstm-track-id"));

    if (Number.isFinite(id) && trackMap.has(id)) {
      assignTrack(slot, id);
    }
  }

  function handleSlotClick(slot: Slot) {
    if (selectedTrackId != null) {
      assignTrack(slot, selectedTrackId);
    }
  }

  async function buildZip() {
    setErrorMessage("");

    const uniqueSlots = new Map<string, Slot>();

    for (const group of allGroups) {
      for (const slot of group.slots) {
        const key = assignmentKey(slot);

        if (assignments[key] != null && !uniqueSlots.has(key)) {
          uniqueSlots.set(key, slot);
        }
      }
    }

    if (uniqueSlots.size === 0) {
      setErrorMessage(
        language === "ja"
          ? "最低1つのスロットに曲を設定してください。"
          : "Assign at least one track first."
      );
      return;
    }

    setBuilding(true);

    try {
      const downloadJobs: {
        url: string;
        name: string;
        sourceLabel: string;
      }[] = [];
      const missing: string[] = [];
      const outputNames = new Set<string>();

      for (const [key, slot] of uniqueSlots) {
        const track = trackMap.get(assignments[key]);

        if (!track) continue;

        if (!track.brstm_url) {
          missing.push(
            `${language === "ja" ? slot.ja : slot.en}: ${
              language === "ja" ? "通常BRSTMなし" : "normal BRSTM missing"
            }`
          );
          continue;
        }

        const normalName = `${slot.outputNormal}.brstm`;

        if (!outputNames.has(normalName)) {
          outputNames.add(normalName);
          downloadJobs.push({
            url: track.brstm_url,
            name: normalName,
            sourceLabel: displayTrackTitle(track, language),
          });
        }

        if (slot.supportsLap3) {
          const lap3Name = lap3OutputName(slot.outputNormal);

          if (track.brstm_lap3_url && lap3Name) {
            const outputLap3 = `${lap3Name}.brstm`;

            if (!outputNames.has(outputLap3)) {
              outputNames.add(outputLap3);
              downloadJobs.push({
                url: track.brstm_lap3_url,
                name: outputLap3,
                sourceLabel: `${displayTrackTitle(track, language)} Lap 3`,
              });
            }
          } else {
            missing.push(
              `${language === "ja" ? slot.ja : slot.en}: ${
                language === "ja" ? "Lap 3 BRSTMなし" : "Lap 3 BRSTM missing"
              }`
            );
          }
        }
      }

      if (downloadJobs.length === 0) {
        throw new Error("No downloadable BRSTM files were found.");
      }

      const entries: ZipEntry[] = [];

      for (let index = 0; index < downloadJobs.length; index += 1) {
        const job = downloadJobs[index];

        setProgress(
          `${
            language === "ja" ? "取得中" : "Fetching"
          } ${index + 1}/${downloadJobs.length}: ${job.name}`
        );

        const response = await fetch(job.url);

        if (!response.ok) {
          throw new Error(
            `${job.sourceLabel}: HTTP ${response.status}`
          );
        }

        entries.push({
          name: job.name,
          data: await response.arrayBuffer(),
        });
      }

      setProgress(language === "ja" ? "ZIPを作成中..." : "Building ZIP...");

      const blob = createStoredZip(entries);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      const stamp = new Date().toISOString().slice(0, 10);

      anchor.href = url;
      anchor.download = `Kei_BRSTM_Pack_${stamp}.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();

      setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (missing.length > 0) {
        setErrorMessage(
          `${
            language === "ja"
              ? "ZIPは作成しましたが、以下は未収録です:"
              : "ZIP created, but these files were missing:"
          }\n${missing.join("\n")}`
        );
      } else {
        setErrorMessage("");
      }
    } catch (error) {
      console.error(error);
      setErrorMessage(
        `${
          language === "ja"
            ? "Packの作成に失敗しました。"
            : "Failed to build the pack."
        } ${error instanceof Error ? error.message : ""}`
      );
    } finally {
      setBuilding(false);
      setProgress("");
    }
  }

  function renderSlot(slot: Slot) {
    const key = assignmentKey(slot);
    const trackId = assignments[key];
    const track = trackId != null ? trackMap.get(trackId) : undefined;
    const hasMissingLap3 =
      Boolean(track) && slot.supportsLap3 && !track?.brstm_lap3_url;
    const isShared = Boolean(slot.assignmentKey);

    return (
      <div
        key={slot.id}
        className={`${styles.slot} ${track ? styles.slotFilled : ""}`}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => handleDrop(slot, event)}
        onClick={() => handleSlotClick(slot)}
      >
        <div className={styles.slotHeader}>
          <div>
            <div className={styles.slotName}>
              {language === "ja" ? slot.ja : slot.en}
            </div>
            <div className={styles.fileName}>
              {slot.outputNormal}.brstm
              {slot.supportsLap3 && (
                <>
                  <br />
                  {lap3OutputName(slot.outputNormal)}.brstm
                </>
              )}
            </div>
          </div>

          {slot.icon && (
            <img
              className={styles.smallSlotIcon}
              src={slot.icon}
              alt=""
            />
          )}
        </div>

        {isShared && (
          <div className={styles.sharedBadge}>
            {language === "ja"
              ? "ルイージ/マリオ共通"
              : "Shared with Luigi/Mario Circuit"}
          </div>
        )}

        {track ? (
          <div className={styles.assignedTrack}>
            <div className={styles.assignedTitle}>
              {displayTrackTitle(track, language)}
            </div>

            <div className={styles.assignedActions}>
              {track.preview_url && (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onPreview(track, track.preview_url, `pack-${slot.id}`);
                  }}
                >
                  {playingKey === `${track.id}-pack-${slot.id}` ? "■" : "▶"}{" "}
                  {language === "ja" ? "試聴" : "Preview"}
                </button>
              )}

              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  clearSlot(slot);
                }}
              >
                ×
              </button>
            </div>

            {hasMissingLap3 && (
              <div className={styles.warning}>
                {language === "ja"
                  ? "Lap 3が未登録"
                  : "Lap 3 missing"}
              </div>
            )}
          </div>
        ) : (
          <div className={styles.emptySlot}>
            {language === "ja"
              ? "曲をここへドラッグ"
              : "Drop a track here"}
          </div>
        )}
      </div>
    );
  }

  return (
    <section className={`library ${styles.creator}`}>
      <div className={styles.topGrid}>
        <aside className={styles.libraryPanel}>
          <div className={styles.panelHeader}>
            <div>
              <div className={styles.eyebrow}>PACK CREATOR</div>
              <h2>{language === "ja" ? "曲を選ぶ" : "Choose tracks"}</h2>
            </div>
            <span>{tracks.length}</span>
          </div>

          <input
            className={styles.search}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={
              language === "ja"
                ? "曲名・タグで検索"
                : "Search title or tags"
            }
          />

          <p className={styles.help}>
            {language === "ja"
              ? "曲をドラッグして右のスロットへ置きます。クリック選択 → スロットをクリックでも設定できます。"
              : "Drag a track into a slot. You can also select a track, then click a slot."}
          </p>

          <div className={styles.trackPalette}>
            {filteredTracks.map((track) => (
              <div
                key={track.id}
                className={`${styles.paletteTrack} ${
                  selectedTrackId === track.id
                    ? styles.paletteTrackSelected
                    : ""
                }`}
                draggable
                onDragStart={(event) => {
                  event.dataTransfer.setData(
                    "text/kei-brstm-track-id",
                    String(track.id)
                  );
                  event.dataTransfer.effectAllowed = "copy";
                  setSelectedTrackId(track.id);
                }}
                onClick={() => setSelectedTrackId(track.id)}
              >
                <div>
                  <div className={styles.paletteTitle}>
                    {displayTrackTitle(track, language)}
                  </div>
                  <div className={styles.paletteMeta}>
                    {track.category}
                    {track.brstm_lap3_url
                      ? " · Lap 3 ✓"
                      : " · Lap 3 —"}
                  </div>
                </div>

                {track.preview_url && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onPreview(track, track.preview_url, "pack-palette");
                    }}
                  >
                    {playingKey === `${track.id}-pack-palette`
                      ? "■"
                      : "▶"}
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>

        <div className={styles.workspace}>
          <div className={styles.workspaceHeader}>
            <div>
              <div className={styles.eyebrow}>MARIO KART WII SLOTS</div>
              <h2>
                {language === "ja"
                  ? "ダウンロードするスロットを埋める"
                  : "Fill the slots you want"}
              </h2>
              <p>
                {language === "ja"
                  ? "空欄のスロットはZIPに含まれません。レースコースは通常/Lap 3をゲーム用ファイル名へ自動で改名します。"
                  : "Empty slots are excluded. Race slots automatically rename both normal and Lap 3 BRSTMs."}
              </p>
            </div>

            <div className={styles.saveArea}>
              <span>
                {assignedKeys.length}{" "}
                {language === "ja" ? "スロット設定" : "slots filled"}
              </span>
              <button
                className={styles.resetButton}
                type="button"
                onClick={() => setAssignments({})}
                disabled={building || assignedKeys.length === 0}
              >
                {language === "ja" ? "リセット" : "Reset"}
              </button>
              <button
                className={styles.saveButton}
                type="button"
                onClick={buildZip}
                disabled={building || assignedKeys.length === 0}
              >
                {building
                  ? language === "ja"
                    ? "作成中..."
                    : "Building..."
                  : language === "ja"
                  ? "Packを保存"
                  : "Save Pack"}
              </button>
            </div>
          </div>

          {progress && <div className={styles.progress}>{progress}</div>}
          {errorMessage && (
            <pre className={styles.error}>{errorMessage}</pre>
          )}

          <div className={styles.sectionTitle}>
            {language === "ja" ? "レースコース" : "Race Courses"}
          </div>

          <div className={styles.groups}>
            {raceGroups.map((group) => (
              <div className={styles.group} key={group.id}>
                <div className={styles.groupLabel}>
                  {group.icon && (
                    <img src={group.icon} alt="" />
                  )}
                  <div>
                    <strong>
                      {language === "ja" ? group.ja : group.en}
                    </strong>
                    <small>
                      {language === "ja" ? group.en : group.ja}
                    </small>
                  </div>
                </div>

                <div className={styles.slotGrid}>
                  {group.slots.map(renderSlot)}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.sectionTitle}>
            {language === "ja" ? "バトル" : "Battle"}
          </div>

          <div className={styles.groups}>
            {battleGroups.map((group) => (
              <div className={styles.group} key={group.id}>
                <div className={styles.groupLabel}>
                  {group.icon && <img src={group.icon} alt="" />}
                  <div>
                    <strong>
                      {language === "ja" ? group.ja : group.en}
                    </strong>
                    <small>
                      {language === "ja" ? group.en : group.ja}
                    </small>
                  </div>
                </div>

                <div className={styles.slotGrid}>
                  {group.slots.map(renderSlot)}
                </div>
              </div>
            ))}
          </div>

          <div className={styles.sectionTitle}>
            {language === "ja" ? "オプション" : "Options"}
          </div>

          <div className={styles.groups}>
            {optionGroups.map((group) => (
              <div className={styles.group} key={group.id}>
                <div className={styles.groupLabel}>
                  <div className={styles.toolIcon}>🔧</div>
                  <div>
                    <strong>
                      {language === "ja" ? group.ja : group.en}
                    </strong>
                    <small>
                      {language === "ja" ? group.en : group.ja}
                    </small>
                  </div>
                </div>

                <div className={styles.slotGrid}>
                  {group.slots.map(renderSlot)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
