"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import KeiProjectRail from "@/components/KeiProjectRail";
import PackCreator from "@/components/PackCreator";
import VolumeControl from "@/components/VolumeControl";
import TagSearchInput, { type TagSuggestion } from "@/components/TagSearchInput";

type Track = {
  id: number;
  title: string;
  title_en: string;
  category: string;
  tags: string;
  loop_type: string;
  brstm_url: string;
  preview_url: string;
  brstm_lap3_url: string;
  preview_lap3_url: string;
  download_count: number;
  created_at: string;
};

type MusicPack = {
  id: number;
  title: string;
  tags: string;
  youtube_url: string;
  zip_url: string;
  created_at: string;
};

type CategoryFilter = "すべて" | "コースBGM" | "その他BGM" | "Music Pack" | "Pack作成";

type TagDefinition = {
  name: string;
  name_en: string;
};

const translations = {
  ja: {
    subtitle:
      "Mario Kart Wii / CTGP-R 向けミュージックハックを検索・試聴・ダウンロード",
    searchTracks: "曲名・タグで検索",
    searchPacks: "パック名・タグで検索",
    all: "すべて",
    courseBgm: "コースBGM",
    otherBgm: "その他BGM",
    musicPack: "Music Pack",
    packCreator: "Pack作成",
    newest: "新着順",
    name: "曲名順",
    ascending: "昇順",
    descending: "降順",
    loopOnly: "Loopのみ",
    tagSearch: "タグをカンマ区切りで検索",
    tagAll: "完全一致（すべて含む）",
    tagAny: "1つでも一致",
    random: "ランダム選曲",
    clearRandom: "ランダム解除",
    published: "公開中のBRSTM",
    publishedPacks: "公開中のMusic Packs",
    packDownload: "ZIPをダウンロード",
    normal: "通常",
    lap3: "Lap 3",
    download: "ダウンロード",
    admin: "管理者ログイン",
    empty: "公開中の音源がありません。",
    emptyPacks: "公開中のMusic Packがありません。",
    loading: "読み込み中...",
    error: "曲データを読み込めませんでした。",
    noPreview: "この曲にはプレビュー音源が登録されていません。",
    previewError: "プレビュー音源を再生できませんでした。",
    noDownload: "ダウンロードファイルが未登録です。",
    footer: "掲載音源は管理者が確認して公開しています。",
  },
  en: {
    subtitle:
      "Search, preview, and download music hacks for Mario Kart Wii / CTGP-R",
    searchTracks: "Search by title or tags",
    searchPacks: "Search packs by title or tags",
    all: "All",
    courseBgm: "Course BGM",
    otherBgm: "Other BGM",
    musicPack: "Music Pack",
    packCreator: "Pack Creator",
    newest: "Newest",
    name: "Title A-Z",
    ascending: "Ascending",
    descending: "Descending",
    loopOnly: "Loop only",
    tagSearch: "Tags separated by commas",
    tagAll: "Match all",
    tagAny: "Match any",
    random: "Random Pick",
    clearRandom: "Clear Random",
    published: "Available BRSTMs",
    publishedPacks: "Available Music Packs",
    packDownload: "Download ZIP",
    normal: "Normal",
    lap3: "Lap 3",
    download: "Download",
    admin: "Admin Login",
    empty: "No published audio found.",
    emptyPacks: "No published music packs.",
    loading: "Loading...",
    error: "Failed to load track data.",
    noPreview: "No preview audio has been registered for this track.",
    previewError: "The preview audio could not be played.",
    noDownload: "No download file has been registered.",
    footer: "All hosted audio is reviewed by the administrator.",
  },
};

function createDownloadUrl(url: string) {
  if (!url) return "";
  return url.includes("?") ? `${url}&download=` : `${url}?download=`;
}

function getLoopValue(loopType: string) {
  return loopType === "loop" || loopType === "perfect_loop" ? "Loop" : "No";
}

function hasLoop(loopType: string) {
  return loopType === "loop" || loopType === "perfect_loop";
}

function getYouTubeEmbedUrl(url: string) {
  if (!url) return "";

  try {
    const parsed = new URL(url);
    let id = "";

    if (parsed.hostname === "youtu.be") {
      id = parsed.pathname.replace(/^\/+/, "").split("/")[0];
    } else if (
      parsed.hostname.includes("youtube.com") ||
      parsed.hostname.includes("youtube-nocookie.com")
    ) {
      id = parsed.searchParams.get("v") || "";

      if (!id) {
        const parts = parsed.pathname.split("/").filter(Boolean);
        const markerIndex = parts.findIndex((part) =>
          ["embed", "shorts", "live"].includes(part)
        );

        if (markerIndex >= 0 && parts[markerIndex + 1]) {
          id = parts[markerIndex + 1];
        }
      }
    }

    if (!id) return "";
    return `https://www.youtube-nocookie.com/embed/${id}`;
  } catch {
    return "";
  }
}

function parseTagSearch(
  value: string,
  aliasMap?: ReadonlyMap<string, string>
) {
  const seen = new Set<string>();

  return value
    .split(",")
    .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
    .filter(Boolean)
    .map((tag) => aliasMap?.get(tag) ?? tag)
    .filter((tag) => {
      if (seen.has(tag)) return false;
      seen.add(tag);
      return true;
    });
}

function matchesTagSearch(
  tagsValue: string,
  searchValue: string,
  mode: "all" | "any",
  aliasMap?: ReadonlyMap<string, string>
) {
  const requested = parseTagSearch(searchValue, aliasMap);
  if (requested.length === 0) return true;

  const tags = new Set(
    (tagsValue || "No tag")
      .split(",")
      .map((tag) => tag.trim().replace(/^#/, "").toLowerCase())
      .filter(Boolean)
  );

  return mode === "all"
    ? requested.every((tag) => tags.has(tag))
    : requested.some((tag) => tags.has(tag));
}

export default function Home() {
  const [language, setLanguage] = useState<"ja" | "en">("ja");
  const [query, setQuery] = useState("");
  const [tagQuery, setTagQuery] = useState("");
  const [tagMatchMode, setTagMatchMode] = useState<"all" | "any">("all");
  const [category, setCategory] = useState<CategoryFilter>("すべて");
  const [sort, setSort] = useState<"newest" | "name">("newest");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [loopOnly, setLoopOnly] = useState(false);
  const [randomTrackId, setRandomTrackId] = useState<number | null>(null);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [packs, setPacks] = useState<MusicPack[]>([]);
  const [tagDefinitions, setTagDefinitions] = useState<TagDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [playingKey, setPlayingKey] = useState<string | null>(null);
  const [volume, setVolume] = useState(0.25);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const t = translations[language];

  useEffect(() => {
    loadTracks();
    loadPacks();
    loadTagDefinitions();

    const savedVolume = window.localStorage.getItem("kei-brstm-hub-volume");
    if (savedVolume !== null) {
      const parsed = Number(savedVolume);
      if (!Number.isNaN(parsed)) {
        setVolume(Math.min(0.5, Math.max(0, parsed)));
      }
    }
  }, []);

  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    window.localStorage.setItem("kei-brstm-hub-volume", String(volume));
  }, [volume]);

  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
    };
  }, []);

  async function loadTracks() {
    setLoading(true);
    setLoadError(false);

    const { data, error } = await supabase
      .from("tracks")
      .select(
        `
        id,
        title,
        title_en,
        category,
        tags,
        loop_type,
        brstm_url,
        preview_url,
        brstm_lap3_url,
        preview_lap3_url,
        download_count,
        created_at
      `
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Failed to load tracks:", error);
      setLoadError(true);
      setLoading(false);
      return;
    }

    setTracks(
      ((data as Track[]) ?? []).map((track) => ({
        ...track,
        tags: track.tags?.trim() || "No tag",
      }))
    );
    setLoading(false);
  }

  async function loadPacks() {
    const { data, error } = await supabase
      .from("music_packs")
      .select(
        `
        id,
        title,
        tags,
        youtube_url,
        zip_url,
        created_at
      `
      )
      .eq("is_published", true)
      .order("created_at", { ascending: false });

    if (error) {
      console.warn("Music packs could not be loaded.", error);
      setPacks([]);
      return;
    }

    setPacks(
      ((data as MusicPack[]) ?? []).map((pack) => ({
        ...pack,
        tags: pack.tags?.trim() || "No tag",
      }))
    );
  }

  async function loadTagDefinitions() {
    const { data, error } = await supabase
      .from("tag_definitions")
      .select("name, name_en")
      .order("name", { ascending: true });

    if (error) {
      console.warn("Tag definitions could not be loaded.", error);
      setTagDefinitions([]);
      return;
    }

    setTagDefinitions((data as TagDefinition[]) ?? []);
  }

  function getDisplayTitle(track: Track) {
    return language === "en" ? track.title_en || track.title : track.title;
  }

  const tagSearchSuggestions = useMemo<TagSuggestion[]>(() => {
    const names = new Map<string, string>();

    const collect = (value: string) => {
      for (const raw of (value || "No tag").split(",")) {
        const name = raw.trim();
        if (!name) continue;
        const key = name.toLowerCase();
        if (!names.has(key)) names.set(key, name);
      }
    };

    tracks.forEach((track) => collect(track.tags));
    packs.forEach((pack) => collect(pack.tags));
    tagDefinitions.forEach((definition) => {
      const name = definition.name.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!names.has(key)) names.set(key, name);
    });

    const definitionMap = new Map(
      tagDefinitions.map((definition) => [
        definition.name.toLowerCase(),
        definition.name_en || "",
      ])
    );

    return Array.from(names.values())
      .map((name) => ({
        name,
        name_en: definitionMap.get(name.toLowerCase()) || "",
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [tracks, packs, tagDefinitions]);

  const tagAliasMap = useMemo(() => {
    const map = new Map<string, string>();

    for (const suggestion of tagSearchSuggestions) {
      const canonical = suggestion.name.toLowerCase();
      map.set(canonical, canonical);

      const english = suggestion.name_en?.trim().toLowerCase();
      if (english) map.set(english, canonical);
    }

    return map;
  }, [tagSearchSuggestions]);

  const tagEnglishMap = useMemo(
    () =>
      new Map(
        tagDefinitions.map((definition) => [
          definition.name.toLowerCase(),
          definition.name_en || "",
        ])
      ),
    [tagDefinitions]
  );

  function getDisplayTagName(tag: string) {
    if (language !== "en") return tag;
    return tagEnglishMap.get(tag.toLowerCase())?.trim() || tag;
  }

  const filteredTracks = useMemo(() => {
    const keyword = query.trim().toLowerCase();

    const direction = sortDirection === "asc" ? 1 : -1;

    return [...tracks]
      .filter((track) => category === "すべて" || track.category === category)
      .filter((track) => !loopOnly || hasLoop(track.loop_type))
      .filter((track) =>
        matchesTagSearch(track.tags, tagQuery, tagMatchMode, tagAliasMap)
      )
      .filter((track) => {
        const searchableText = [
          track.title,
          track.title_en,
          track.category,
          track.tags,
          getLoopValue(track.loop_type),
        ]
          .join(" ")
          .toLowerCase();

        return searchableText.includes(keyword);
      })
      .sort((a, b) => {
        if (sort === "name") {
          const titleA = language === "en" ? a.title_en || a.title : a.title;
          const titleB = language === "en" ? b.title_en || b.title : b.title;
          return titleA.localeCompare(titleB) * direction;
        }

        return a.created_at.localeCompare(b.created_at) * direction;
      });
  }, [
    tracks,
    query,
    category,
    sort,
    sortDirection,
    loopOnly,
    tagQuery,
    tagMatchMode,
    tagAliasMap,
    language,
  ]);

  const visibleTracks = useMemo(() => {
    if (randomTrackId === null) return filteredTracks;
    return filteredTracks.filter((track) => track.id === randomTrackId);
  }, [filteredTracks, randomTrackId]);

  const visiblePacks = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const direction = sortDirection === "asc" ? 1 : -1;

    return [...packs]
      .filter((pack) =>
        [pack.title, pack.tags].join(" ").toLowerCase().includes(keyword)
      )
      .filter((pack) =>
        matchesTagSearch(pack.tags, tagQuery, tagMatchMode, tagAliasMap)
      )
      .sort((a, b) => {
        if (sort === "name") {
          return a.title.localeCompare(b.title) * direction;
        }

        return a.created_at.localeCompare(b.created_at) * direction;
      });
  }, [packs, query, tagQuery, tagMatchMode, tagAliasMap, sort, sortDirection]);

  const categories = [
    { value: "すべて" as CategoryFilter, label: t.all },
    { value: "コースBGM" as CategoryFilter, label: t.courseBgm },
    { value: "その他BGM" as CategoryFilter, label: t.otherBgm },
    { value: "Music Pack" as CategoryFilter, label: t.musicPack },
    { value: "Pack作成" as CategoryFilter, label: t.packCreator },
  ];

  function handleTagClick(tag: string) {
    const normalized = tag.trim().replace(/^#/, "").toLowerCase();
    const existing = tagQuery
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (
      !existing.some(
        (item) => item.replace(/^#/, "").toLowerCase() === normalized
      )
    ) {
      setTagQuery([...existing, tag].join(", "));
    }

    setRandomTrackId(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleRandomPick() {
    if (filteredTracks.length === 0) return;
    const randomIndex = Math.floor(Math.random() * filteredTracks.length);
    setRandomTrackId(filteredTracks[randomIndex].id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handlePreview(
    track: Track,
    previewUrl: string,
    label: string
  ) {
    if (!previewUrl) {
      window.alert(t.noPreview);
      return;
    }

    const key = `${track.id}-${label}`;

    if (playingKey === key && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
      setPlayingKey(null);
      return;
    }

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const nextAudio = new Audio(previewUrl);
    nextAudio.volume = volume;

    nextAudio.addEventListener("ended", () => {
      setPlayingKey(null);
      audioRef.current = null;
    });

    nextAudio.addEventListener("error", () => {
      setPlayingKey(null);
      audioRef.current = null;
      window.alert(t.previewError);
    });

    audioRef.current = nextAudio;
    setPlayingKey(key);

    try {
      await nextAudio.play();
    } catch (error) {
      console.error("Failed to play preview:", error);
      audioRef.current = null;
      setPlayingKey(null);
      window.alert(t.previewError);
    }
  }

  async function handleDownload(track: Track) {
    const { error } = await supabase.rpc("increment_download_count", {
      track_id: track.id,
    });

    if (error) {
      console.error("Failed to increment download count:", error);
      return;
    }

    setTracks((currentTracks) =>
      currentTracks.map((item) =>
        item.id === track.id
          ? { ...item, download_count: item.download_count + 1 }
          : item
      )
    );
  }

  function renderTrackFileButtons(
    track: Track,
    label: string,
    previewUrl: string,
    brstmUrl: string
  ) {
    const key = `${track.id}-${label}`;

    return (
      <div className="fileButtonGroup">
        <span className="fileLabel">{label}</span>

        <button
          className={
            playingKey === key ? "playButton small playing" : "playButton small"
          }
          type="button"
          onClick={() => handlePreview(track, previewUrl, label)}
        >
          {playingKey === key ? "■" : "▶"}
        </button>

        {brstmUrl ? (
          <a
            className="downloadButton"
            href={createDownloadUrl(brstmUrl)}
            onClick={() => handleDownload(track)}
          >
            {t.download}
          </a>
        ) : (
          <button
            className="downloadButton"
            type="button"
            disabled
            title={t.noDownload}
          >
            {t.download}
          </button>
        )}
      </div>
    );
  }

  function renderTags(tags: string, clickable = false) {
    const tagList = tags
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    if (tagList.length === 0) return null;

    return (
      <div className="trackTags">
        {tagList.map((tag) =>
          clickable ? (
            <button
              className="tag clickableTag"
              key={tag}
              type="button"
              onClick={() => handleTagClick(tag)}
            >
              #{getDisplayTagName(tag)}
            </button>
          ) : (
            <span className="tag" key={tag}>
              #{getDisplayTagName(tag)}
            </span>
          )
        )}
      </div>
    );
  }

  const isPackView = category === "Music Pack";
  const isPackCreatorView = category === "Pack作成";

  return (
    <div className="page">
      <KeiProjectRail />

      <header className="header">
        <div className="headerInner">
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              minWidth: 0,
            }}
          >
            <Link className="logoArea linkLogo" href="/">
              <div className="logo">♫</div>
              <span>Kei BRSTM Hub</span>
            </Link>

            <VolumeControl volume={volume} onVolumeChange={setVolume} />
          </div>

          <div className="headerButtons">
            <button
              className="secondaryButton"
              type="button"
              onClick={() => setLanguage(language === "ja" ? "en" : "ja")}
            >
              {language === "ja" ? "EN" : "JP"}
            </button>

            <Link className="primaryButton linkButton" href="/admin/login">
              {t.admin}
            </Link>
          </div>
        </div>
      </header>

      <main
        className="main"
        style={
          isPackCreatorView
            ? {
                width: "100%",
                maxWidth: "none",
                paddingLeft: "24px",
                paddingRight: "24px",
                boxSizing: "border-box",
              }
            : undefined
        }
      >
        <section
          className="hero"
          style={
            isPackCreatorView
              ? {
                  width: "100%",
                  maxWidth: "940px",
                  marginLeft: "auto",
                  marginRight: "auto",
                }
              : undefined
          }
        >
          <p className="label">CTGP-R MUSIC LIBRARY</p>
          <h1>Kei BRSTM Hub</h1>
          <p className="subtitle">{t.subtitle}</p>
        </section>

        <section
          className="controls"
          style={
            isPackCreatorView
              ? {
                  width: "100%",
                  maxWidth: "940px",
                  marginLeft: "auto",
                  marginRight: "auto",
                }
              : undefined
          }
        >
          {!isPackCreatorView && (
            <div className="controlTop" style={{ flexWrap: "wrap" }}>
              <input
                className="search"
                type="text"
                placeholder={isPackView ? t.searchPacks : t.searchTracks}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setRandomTrackId(null);
                }}
              />

              <select
                className="sort"
                value={sort}
                onChange={(event) => {
                  const nextSort = event.target.value as "newest" | "name";
                  setSort(nextSort);
                  setSortDirection(nextSort === "name" ? "asc" : "desc");
                  setRandomTrackId(null);
                }}
                aria-label={t.newest}
              >
                <option value="newest">{t.newest}</option>
                <option value="name">{t.name}</option>
              </select>

              <select
                className="sort"
                style={{ minWidth: "120px" }}
                value={sortDirection}
                onChange={(event) => {
                  setSortDirection(event.target.value as "asc" | "desc");
                  setRandomTrackId(null);
                }}
                aria-label={sortDirection === "asc" ? t.ascending : t.descending}
              >
                <option value="asc">{t.ascending}</option>
                <option value="desc">{t.descending}</option>
              </select>

              {!isPackView && (
                <button
                  className="secondaryButton"
                  type="button"
                  aria-pressed={loopOnly}
                  onClick={() => {
                    setLoopOnly((current) => !current);
                    setRandomTrackId(null);
                  }}
                  style={
                    loopOnly
                      ? {
                          background: "#ffffff",
                          color: "#09090b",
                          borderColor: "#ffffff",
                        }
                      : undefined
                  }
                >
                  ↻ {t.loopOnly}
                </button>
              )}

              {!isPackView &&
                (randomTrackId === null ? (
                  <button
                    className="secondaryButton"
                    type="button"
                    onClick={handleRandomPick}
                    disabled={filteredTracks.length === 0}
                  >
                    {t.random}
                  </button>
                ) : (
                  <button
                    className="secondaryButton"
                    type="button"
                    onClick={() => setRandomTrackId(null)}
                  >
                    {t.clearRandom}
                  </button>
                ))}
            </div>
          )}

          {!isPackCreatorView && (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 220px",
                gap: "12px",
                marginTop: "12px",
              }}
            >
              <TagSearchInput
                className="search"
                placeholder={t.tagSearch}
                value={tagQuery}
                onChange={setTagQuery}
                onAfterChange={() => setRandomTrackId(null)}
                suggestions={tagSearchSuggestions}
                language={language}
              />

              <select
                className="sort"
                value={tagMatchMode}
                onChange={(event) => {
                  setTagMatchMode(event.target.value as "all" | "any");
                  setRandomTrackId(null);
                }}
              >
                <option value="all">{t.tagAll}</option>
                <option value="any">{t.tagAny}</option>
              </select>
            </div>
          )}

          <div className="categories">
            {categories.map((item) => (
              <button
                key={item.value}
                type="button"
                className={
                  category === item.value ? "category active" : "category"
                }
                onClick={() => {
                  setCategory(item.value);
                  setRandomTrackId(null);
                }}
              >
                {item.label}
              </button>
            ))}
          </div>
        </section>

        {isPackCreatorView ? (
          <PackCreator
            tracks={tracks}
            tagDefinitions={tagDefinitions}
            language={language}
            volume={volume}
            playingKey={playingKey}
            onPreview={(track, previewUrl, label) => {
              const fullTrack = tracks.find((item) => item.id === track.id);

              if (fullTrack) {
                handlePreview(fullTrack, previewUrl, label);
              }
            }}
          />
        ) : !isPackView ? (
          <section className="library">
            <div className="sectionHeader">
              <h2>{t.published}</h2>
              <span>{visibleTracks.length} tracks</span>
            </div>

            {loading && <div className="empty">{t.loading}</div>}
            {loadError && <div className="empty">{t.error}</div>}

            {!loading && !loadError && (
              <div className="trackList">
                {visibleTracks.map((track) => (
                  <article className="trackCard" key={track.id}>
                    <div className="trackInfo">
                      <div className="trackTitleRow">
                        <h3>{getDisplayTitle(track)}</h3>
                        <span className="tag">{track.category}</span>
                        <span
                          aria-label={hasLoop(track.loop_type) ? "Loop" : "No Loop"}
                          title={hasLoop(track.loop_type) ? "Loop" : "No Loop"}
                          style={{
                            width: "22px",
                            height: "22px",
                            display: "inline-grid",
                            placeItems: "center",
                            borderRadius: "999px",
                            border: hasLoop(track.loop_type)
                              ? "1px solid rgba(110, 231, 183, 0.68)"
                              : "1px solid rgba(255, 255, 255, 0.14)",
                            background: hasLoop(track.loop_type)
                              ? "rgba(110, 231, 183, 0.12)"
                              : "transparent",
                            color: hasLoop(track.loop_type)
                              ? "rgb(110, 231, 183)"
                              : "rgba(255, 255, 255, 0.22)",
                            fontSize: "14px",
                            fontWeight: 800,
                            lineHeight: 1,
                            flex: "0 0 auto",
                          }}
                        >
                          ↻
                        </span>
                      </div>

                      {language === "en" &&
                        track.title_en &&
                        track.title_en !== track.title && (
                          <p className="source">{track.title}</p>
                        )}

                      {track.tags && renderTags(track.tags, true)}
                    </div>

                    <div className="trackActions vertical">
                      {renderTrackFileButtons(
                        track,
                        t.normal,
                        track.preview_url,
                        track.brstm_url
                      )}

                      {renderTrackFileButtons(
                        track,
                        t.lap3,
                        track.preview_lap3_url,
                        track.brstm_lap3_url
                      )}
                    </div>
                  </article>
                ))}

                {visibleTracks.length === 0 && (
                  <div className="empty">{t.empty}</div>
                )}
              </div>
            )}
          </section>
        ) : (
          <section className="library">
            <div className="sectionHeader">
              <h2>{t.publishedPacks}</h2>
              <span>{visiblePacks.length} packs</span>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
                gap: "18px",
              }}
            >
              {visiblePacks.map((pack) => {
                const embedUrl = getYouTubeEmbedUrl(pack.youtube_url);

                return (
                  <article
                    key={pack.id}
                    style={{
                      overflow: "hidden",
                      border: "1px solid rgba(255,255,255,0.12)",
                      borderRadius: "16px",
                      background: "rgba(255,255,255,0.018)",
                    }}
                  >
                    <div
                      style={{
                        aspectRatio: "16 / 9",
                        background: "rgba(255,255,255,0.03)",
                      }}
                    >
                      {embedUrl ? (
                        <iframe
                          src={embedUrl}
                          title={`${pack.title} preview`}
                          style={{ width: "100%", height: "100%", border: 0 }}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                          allowFullScreen
                        />
                      ) : (
                        <div
                          style={{
                            width: "100%",
                            height: "100%",
                            display: "grid",
                            placeItems: "center",
                            opacity: 0.45,
                            fontSize: "12px",
                          }}
                        >
                          YouTube preview not set
                        </div>
                      )}
                    </div>

                    <div style={{ padding: "16px" }}>
                      <h3 style={{ margin: 0 }}>{pack.title}</h3>
                      {pack.tags && (
                        <div style={{ marginTop: "12px" }}>
                          {renderTags(pack.tags, false)}
                        </div>
                      )}

                      <div style={{ marginTop: "16px" }}>
                        {pack.zip_url ? (
                          <a
                            className="primaryButton linkButton"
                            href={createDownloadUrl(pack.zip_url)}
                          >
                            {t.packDownload}
                          </a>
                        ) : (
                          <button className="primaryButton" type="button" disabled>
                            {t.packDownload}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {visiblePacks.length === 0 && (
              <div className="empty" style={{ marginTop: "18px" }}>
                {t.emptyPacks}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <p>© 2026 Kei BRSTM Hub · {t.footer}</p>
      </footer>
    </div>
  );
}
